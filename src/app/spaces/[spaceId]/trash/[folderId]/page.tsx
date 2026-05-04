import { TrashFolderClient } from "./trash-folder-client"

export default async function TrashFolderPage({
  params,
}: {
  params: Promise<{ spaceId: string; folderId: string }>
}) {
  const { spaceId, folderId } = await params

  return <TrashFolderClient spaceId={spaceId} folderId={folderId} />
}
