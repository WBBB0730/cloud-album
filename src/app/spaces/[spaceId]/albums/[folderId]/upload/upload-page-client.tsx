'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { MobileFrame } from '@/components/app/mobile-frame'
import { TopBar } from '@/components/app/top-bar'
import {
  cleanupExpiredShareImports,
  deleteShareImportBatch,
  listShareImportFiles,
  type ShareImportFileRecord,
} from '@/lib/share-import-store'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useFixedBackNavigation } from '@/hooks/use-fixed-back-navigation'

import { UploadClient } from './upload-client'

const getImportFile = (record: ShareImportFileRecord) => {
  if (record.file instanceof File) {
    return record.file
  }

  return new File([record.file], record.name, {
    lastModified: record.lastModified,
    type: record.type,
  })
}

export function UploadPageClient({
  spaceId,
  folderId,
}: {
  spaceId: string
  folderId: string
}) {
  const backHref = `/spaces/${spaceId}/albums/${folderId}`
  const searchParams = useSearchParams()
  const shareBatchId = searchParams.get('shareBatch')
  const [hasBlockingUploads, setHasBlockingUploads] = useState(false)
  const [initialFiles, setInitialFiles] = useState<File[] | undefined>()
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const hasBlockingUploadsRef = useRef(false)
  const queuedShareBatchIdRef = useRef<string | null>(null)
  const initialFilesQueuedRef = useRef(false)
  const activeShareBatchId = useMemo(
    () => shareBatchId?.trim() || null,
    [shareBatchId]
  )
  const { leaveToTarget, requestBack } = useFixedBackNavigation(backHref, {
    blocking: hasBlockingUploads,
    onBlockedBack: () => setLeaveDialogOpen(true),
  })

  useEffect(() => {
    hasBlockingUploadsRef.current = hasBlockingUploads
  }, [hasBlockingUploads])

  useEffect(() => {
    if (!activeShareBatchId) {
      setInitialFiles(undefined)
      queuedShareBatchIdRef.current = null
      initialFilesQueuedRef.current = false
      return
    }

    let active = true
    queuedShareBatchIdRef.current = activeShareBatchId
    initialFilesQueuedRef.current = false

    const loadShareBatch = async () => {
      try {
        await cleanupExpiredShareImports()
        const records = await listShareImportFiles(activeShareBatchId)

        if (!active || queuedShareBatchIdRef.current !== activeShareBatchId) {
          return
        }

        setInitialFiles(records.map(getImportFile))
      } catch {
        if (active && queuedShareBatchIdRef.current === activeShareBatchId) {
          setInitialFiles(undefined)
        }
      }
    }

    void loadShareBatch()

    return () => {
      active = false
    }
  }, [activeShareBatchId])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasBlockingUploadsRef.current) {
        return
      }

      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  const handleBackClick = () => {
    requestBack('button')
  }

  const keepUploading = useCallback(() => {
    setLeaveDialogOpen(false)
  }, [])

  const leavePage = useCallback(() => {
    setLeaveDialogOpen(false)
    leaveToTarget()
  }, [leaveToTarget])

  const handleInitialFilesQueued = useCallback(() => {
    if (!activeShareBatchId || initialFilesQueuedRef.current) {
      return
    }

    initialFilesQueuedRef.current = true
    void deleteShareImportBatch(activeShareBatchId)
  }, [activeShareBatchId])

  return (
    <>
      <MobileFrame className="ca-scroll-layout">
        <div className="ca-fixed-section">
          <TopBar
            title="上传"
            leading={
              <button
                type="button"
                className="ca-icon-btn"
                aria-label="返回"
                onClick={handleBackClick}
              >
                <ChevronLeft />
              </button>
            }
          />
        </div>
        <div className="ca-scroll-section">
          <UploadClient
            initialFiles={initialFiles}
            spaceId={spaceId}
            folderId={folderId}
            onInitialFilesQueued={handleInitialFilesQueued}
            onBlockingChange={setHasBlockingUploads}
          />
        </div>
      </MobileFrame>

      <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>离开上传页？</AlertDialogTitle>
            <AlertDialogDescription>
              还有文件正在等待或上传中，离开后本次上传可能会中断。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="ca-confirm-footer">
            <AlertDialogCancel
              className="ca-confirm-button"
              onClick={keepUploading}
            >
              继续上传
            </AlertDialogCancel>
            <AlertDialogAction
              className="ca-confirm-button ca-danger-confirm-button"
              onClick={leavePage}
            >
              离开
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
