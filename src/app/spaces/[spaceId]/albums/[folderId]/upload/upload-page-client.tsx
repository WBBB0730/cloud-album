"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft } from "lucide-react"

import { MobileFrame } from "@/components/app/mobile-frame"
import { TopBar } from "@/components/app/top-bar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useFixedBackNavigation } from "@/hooks/use-fixed-back-navigation"

import { UploadClient } from "./upload-client"

export function UploadPageClient({
  spaceId,
  folderId,
}: {
  spaceId: string
  folderId: string
}) {
  const backHref = `/spaces/${spaceId}/albums/${folderId}`
  const [hasBlockingUploads, setHasBlockingUploads] = useState(false)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const hasBlockingUploadsRef = useRef(false)
  const { leaveToTarget, requestBack } = useFixedBackNavigation(backHref, {
    blocking: hasBlockingUploads,
    onBlockedBack: () => setLeaveDialogOpen(true),
  })

  useEffect(() => {
    hasBlockingUploadsRef.current = hasBlockingUploads
  }, [hasBlockingUploads])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasBlockingUploadsRef.current) {
        return
      }

      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [])

  const handleBackClick = () => {
    requestBack("button")
  }

  const keepUploading = useCallback(() => {
    setLeaveDialogOpen(false)
  }, [])

  const leavePage = useCallback(() => {
    setLeaveDialogOpen(false)
    leaveToTarget()
  }, [leaveToTarget])

  return (
    <>
      <MobileFrame className="ca-scroll-layout">
        <div className="ca-fixed-section">
          <TopBar
            title="上传"
            leading={
              <button type="button" className="ca-icon-btn" aria-label="返回" onClick={handleBackClick}>
                <ChevronLeft />
              </button>
            }
          />
        </div>
        <div className="ca-scroll-section">
          <UploadClient spaceId={spaceId} folderId={folderId} onBlockingChange={setHasBlockingUploads} />
        </div>
      </MobileFrame>

      <AlertDialog
        open={leaveDialogOpen}
        onOpenChange={setLeaveDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>离开上传页？</AlertDialogTitle>
            <AlertDialogDescription>
              还有文件正在等待或上传中，离开后本次上传可能会中断。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={keepUploading}>继续上传</AlertDialogCancel>
            <AlertDialogAction className="ca-danger-confirm-button" onClick={leavePage}>
              离开
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
