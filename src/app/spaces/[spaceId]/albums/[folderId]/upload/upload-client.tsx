"use client"

import { useEffect, useRef, useState } from "react"
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

const UPLOAD_FILE_CONCURRENCY = 5
const COS_CHUNK_CONCURRENCY_PER_FILE = 1
const VIDEO_META_TIMEOUT_MS = 5000

const getImageMeta = async (file: File) => {
  const [bitmap, exif] = await Promise.all([
    createImageBitmap(file).catch(() => null),
    exifr.parse(file, ["DateTimeOriginal", "CreateDate"]).catch(() => null),
  ])
  const width = bitmap?.width ?? null
  const height = bitmap?.height ?? null

  bitmap?.close()

  const takenAt =
    exif?.DateTimeOriginal instanceof Date
      ? exif.DateTimeOriginal.toISOString()
      : exif?.CreateDate instanceof Date
        ? exif.CreateDate.toISOString()
        : null

  return {
    width,
    height,
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
    let settled = false
    let timeout: ReturnType<typeof setTimeout>

    const settle = (meta: {
      width: number | null
      height: number | null
      duration: number | null
      takenAt: string | null
    }) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeout)
      video.onloadedmetadata = null
      video.onerror = null
      video.removeAttribute("src")
      video.load()
      URL.revokeObjectURL(url)
      resolve(meta)
    }

    video.preload = "metadata"
    video.onloadedmetadata = () => {
      settle({
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        duration: Number.isFinite(video.duration) ? video.duration : null,
        takenAt: new Date(file.lastModified).toISOString(),
      })
    }
    video.onerror = () => {
      settle({ width: null, height: null, duration: null, takenAt: new Date(file.lastModified).toISOString() })
    }
    timeout = setTimeout(() => {
      settle({ width: null, height: null, duration: null, takenAt: new Date(file.lastModified).toISOString() })
    }, VIDEO_META_TIMEOUT_MS)
    video.src = url
  })

export function UploadClient({
  spaceId,
  folderId,
  onBlockingChange,
}: {
  spaceId: string
  folderId: string
  onBlockingChange?: (blocking: boolean) => void
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const mountedRef = useRef(true)
  const uploadQueueRef = useRef<UploadRow[]>([])
  const queuedUploadIdsRef = useRef(new Set<string>())
  const activeUploadIdsRef = useRef(new Set<string>())
  const [rows, setRows] = useState<UploadRow[]>([])

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      uploadQueueRef.current = []
      queuedUploadIdsRef.current.clear()
      activeUploadIdsRef.current.clear()
    }
  }, [])

  useEffect(() => {
    onBlockingChange?.(rows.some((row) => row.status === "waiting" || row.status === "uploading"))
  }, [onBlockingChange, rows])

  const updateRow = (id: string, patch: Partial<UploadRow>) => {
    if (!mountedRef.current) {
      return
    }

    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const uploadRow = async (row: UploadRow) => {
    updateRow(row.id, { status: "uploading", progress: 0, message: "上传中" })
    let currentSessionId = row.sessionId

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

      currentSessionId = intent.session.id
      updateRow(row.id, { sessionId: currentSessionId, message: "上传中" })

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
        AsyncLimit: COS_CHUNK_CONCURRENCY_PER_FILE,
        onProgress: (progress) => {
          updateRow(row.id, {
            progress: Math.round(progress.percent * 100),
            message: `${formatBytes(progress.loaded)} / ${formatBytes(progress.total)}`,
          })
        },
      })

      await confirmUploadAction(spaceId, intent.session.id)
      updateRow(row.id, { status: "completed", progress: 100, message: "已完成" })
      if (mountedRef.current) {
        router.refresh()
      }
    } catch (error) {
      if (currentSessionId) {
        await failUploadAction(spaceId, currentSessionId).catch(() => null)
      }
      updateRow(row.id, {
        status: "failed",
        message: error instanceof Error ? error.message : "上传失败，可重试",
      })
    }
  }

  const pumpUploadQueue = () => {
    if (!mountedRef.current) {
      return
    }

    while (
      activeUploadIdsRef.current.size < UPLOAD_FILE_CONCURRENCY &&
      uploadQueueRef.current.length > 0
    ) {
      const row = uploadQueueRef.current.shift()

      if (!row) {
        continue
      }

      queuedUploadIdsRef.current.delete(row.id)

      if (activeUploadIdsRef.current.has(row.id)) {
        continue
      }

      activeUploadIdsRef.current.add(row.id)
      void uploadRow(row).finally(() => {
        activeUploadIdsRef.current.delete(row.id)
        pumpUploadQueue()
      })
    }
  }

  const enqueueUploadRows = (uploadRows: UploadRow[]) => {
    for (const row of uploadRows) {
      if (queuedUploadIdsRef.current.has(row.id) || activeUploadIdsRef.current.has(row.id)) {
        continue
      }

      queuedUploadIdsRef.current.add(row.id)
      uploadQueueRef.current.push(row)
    }

    pumpUploadQueue()
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

    setRows((current) => [...current, ...nextRows])
    enqueueUploadRows(nextRows)
  }

  const visibleRows = rows
    .filter((row) => row.status !== "completed")
    .sort((first, second) => {
      if (first.status === second.status) {
        return 0
      }

      return first.status === "uploading" ? -1 : second.status === "uploading" ? 1 : 0
    })
  const completedCount = rows.filter((row) => row.status === "completed").length
  const failedCount = rows.filter((row) => row.status === "failed").length
  const remainingCount = rows.length - completedCount
  const totalMessage =
    failedCount > 0
      ? `已完成 ${completedCount}/${rows.length} · 剩余 ${remainingCount} 项 · 失败 ${failedCount} 项`
      : completedCount === rows.length
        ? `全部上传完成 · ${rows.length} 项`
        : `已完成 ${completedCount}/${rows.length} · 剩余 ${remainingCount} 项`

  return (
    <div className="ca-upload-panel">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(event) => {
          uploadFiles(event.target.files)
          event.currentTarget.value = ""
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="ca-upload-zone"
      >
        <Upload className="size-7 text-[#0f9f8f]" />
        <strong className="text-sm">选择图片和视频</strong>
      </button>

      {rows.length > 0 ? (
        <div className="ca-upload-summary">
          <span>{totalMessage}</span>
        </div>
      ) : null}

      {visibleRows.length > 0 ? (
        <div className="ca-list ca-upload-list">
          {visibleRows.map((row) => (
            <div key={row.id} className="ca-upload-row">
              <div className="ca-file-icon">
                {row.file.type.startsWith("video/") ? <Video className="size-5" /> : <ImageIcon className="size-5" />}
              </div>
              <div className="min-w-0">
                <strong>{row.file.name}</strong>
                <small>
                  {row.message} · {formatBytes(row.file.size)}
                </small>
                {row.status === "waiting" ? null : (
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
                  onClick={() => {
                    updateRow(row.id, { status: "waiting", progress: 0, message: "等待上传" })
                    enqueueUploadRows([row])
                  }}
                >
                    <RotateCw className="size-3.5" />
                    重试
                  </button>
                ) : (
                  <span className="ca-status-pill">
                    {row.status === "uploading" ? "上传中" : "等待"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
