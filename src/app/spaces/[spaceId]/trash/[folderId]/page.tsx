"use client"

import { useParams } from "next/navigation"

import { TrashFolderClient } from "./trash-folder-client"

export default function TrashFolderPage() {
  const params = useParams<{ spaceId: string; folderId: string }>()

  return <TrashFolderClient spaceId={params.spaceId} folderId={params.folderId} />
}
