"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import COS from "cos-js-sdk-v5"
import * as exifr from "exifr"
import { ImageIcon, RotateCw, Upload, Video } from "lucide-react"

import {
  confirmUploadAction,
  createUploadIntentAction,
  failUploadAction,
} from "@/features/uploads/actions"
import { formatBytes } from "@/lib/format"

type UploadRow = {
  id: string
  file: File
  status: "waiting" | "uploading" | "completed" | "failed"
  progress: number
  message: string
  sessionId?: string
}

const getImageMeta = async (file: File) => {
  const [bitmap, exif] = await Promise.all([
    createImageBitmap(file).catch(() => null),
    exifr.parse(file, ["DateTimeOriginal", "CreateDate"]).catch(() => null),
  ])

  const takenAt =
    exif?.DateTimeOriginal instanceof Date
      ? exif.DateTimeOriginal.toISOString()
      : exif?.CreateDate instanceof Date
        ? exif.CreateDate.toISOString()
        : null

  return {
    width: bitmap?.width ?? null,
    height: bitmap?.height ?? null,
    duration: null,
    takenAt,
  }
}

const getVideoMeta = async (file: File) =>
  new Promise<{
    width: number | null
    height: number | null
    duration: number | null
    takenAt: string | null
  }>((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement("video")
    video.preload = "metadata"
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve({
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        duration: Number.isFinite(video.duration) ? video.duration : null,
        takenAt: new Date(file.lastModified).toISOString(),
      })
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ width: null, height: null, duration: null, takenAt: new Date(file.lastModified).toISOString() })
    }
    video.src = url
  })

export function UploadClient({
  spaceId,
  folderId,
}: {
  spaceId: string
  folderId: string
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<UploadRow[]>([])
  const [isPending, startTransition] = useTransition()

  const updateRow = (id: string, patch: Partial<UploadRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const uploadRow = async (row: UploadRow) => {
    updateRow(row.id, { status: "uploading", progress: 0, message: "准备上传" })

    try {
      const meta = row.file.type.startsWith("video/")
        ? await getVideoMeta(row.file)
        : await getImageMeta(row.file)
      const intent = await createUploadIntentAction({
        spaceId,
        folderId,
        filename: row.file.name,
        mimeType: row.file.type || "application/octet-stream",
        size: row.file.size,
        ...meta,
      })

      updateRow(row.id, { sessionId: intent.session.id, message: "分片上传中" })

      const credential = intent.upload.credential
      const cos = new COS({
        getAuthorization: (_options, callback) => {
          callback({
            TmpSecretId: credential.credentials.tmpSecretId,
            TmpSecretKey: credential.credentials.tmpSecretKey,
            SecurityToken: credential.credentials.sessionToken,
            StartTime: credential.startTime,
            ExpiredTime: credential.expiredTime,
            ScopeLimit: true,
          })
        },
      })

      await cos.sliceUploadFile({
        Bucket: intent.upload.bucket,
        Region: intent.upload.region,
        Key: intent.upload.key,
        Body: row.file,
        ContentType: row.file.type || "application/octet-stream",
        ChunkSize: 8 * 1024 * 1024,
        AsyncLimit: 3,
        onProgress: (progress) => {
          updateRow(row.id, {
            progress: Math.round(progress.percent * 100),
            message: `${formatBytes(progress.loaded)} / ${formatBytes(progress.total)}`,
          })
        },
      })

      await confirmUploadAction(spaceId, intent.session.id)
      updateRow(row.id, { status: "completed", progress: 100, message: "已完成" })
      router.refresh()
    } catch (error) {
      if (row.sessionId) {
        await failUploadAction(spaceId, row.sessionId).catch(() => null)
      }
      updateRow(row.id, {
        status: "failed",
        message: error instanceof Error ? error.message : "上传失败，可重试",
      })
    }
  }

  const uploadFiles = (files: FileList | null) => {
    if (!files || files.length === 0) {
      return
    }

    const nextRows = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "waiting" as const,
      progress: 0,
      message: "等待上传",
    }))

    setRows((current) => [...nextRows, ...current])
    startTransition(async () => {
      for (const row of nextRows) {
        await uploadRow(row)
      }
    })
  }

  return (
    <div className="grid gap-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(event) => uploadFiles(event.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="ca-upload-zone"
      >
        <Upload className="size-7 text-[#0f9f8f]" />
        <strong className="text-sm">选择图片和视频</strong>
      </button>

      <div className="ca-list mt-3">
        {rows.map((row) => (
          <div key={row.id} className="ca-upload-row">
            <div className="ca-file-icon">
              {row.file.type.startsWith("video/") ? <Video className="size-5" /> : <ImageIcon className="size-5" />}
            </div>
            <div className="min-w-0">
              <strong>{row.file.name}</strong>
              <small>
                {row.message} · {formatBytes(row.file.size)}
              </small>
              {row.status === "completed" ? null : (
                <div className="ca-progress">
                  <span style={{ width: `${row.progress}%` }} />
                </div>
              )}
            </div>
            <div className="ca-upload-state">
              {row.status === "failed" ? (
                <button
                  type="button"
                  className="ca-upload-action"
                  onClick={async () => {
                    await uploadRow(row)
                  }}
                >
                  <RotateCw className="size-3.5" />
                  重试
                </button>
              ) : (
                <span className="ca-status-pill">
                  {row.status === "completed" ? "完成" : isPending || row.status === "uploading" ? "上传中" : "等待"}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
