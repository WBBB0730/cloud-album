"use client"

import { useParams } from "next/navigation"

import { UploadPageClient } from "./upload-page-client"

export default function UploadPage() {
  const params = useParams<{ spaceId: string; folderId: string }>()

  return <UploadPageClient spaceId={params.spaceId} folderId={params.folderId} />
}
