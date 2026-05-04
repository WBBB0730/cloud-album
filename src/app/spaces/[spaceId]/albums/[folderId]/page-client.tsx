'use client'

import { FolderClient } from './folder-client'

export function FolderPageClient({
  spaceId,
  folderId,
}: {
  spaceId: string
  folderId: string
}) {
  return <FolderClient spaceId={spaceId} folderId={folderId} />
}
