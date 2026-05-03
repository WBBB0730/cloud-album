"use client"

import { useParams } from "next/navigation"

import { UploadFolderClient } from "./upload-folder-client"

export default function ChooseUploadFolderPage() {
  const params = useParams<{ spaceId: string }>()

  return <UploadFolderClient spaceId={params.spaceId} />
}
