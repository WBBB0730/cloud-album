"use client"

import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { MobileFrame } from "@/components/app/mobile-frame"
import { TopBar } from "@/components/app/top-bar"

import { UploadClient } from "./upload-client"

export function UploadPageClient({
  spaceId,
  folderId,
}: {
  spaceId: string
  folderId: string
}) {
  return (
    <MobileFrame className="ca-scroll-layout">
      <div className="ca-fixed-section">
        <TopBar
          title="上传"
          leading={
            <Link href={`/spaces/${spaceId}/albums/${folderId}`} className="ca-icon-btn" aria-label="返回">
              <ChevronLeft />
            </Link>
          }
        />
      </div>
      <div className="ca-scroll-section">
        <UploadClient spaceId={spaceId} folderId={folderId} />
      </div>
    </MobileFrame>
  )
}
