import { UploadFolderClient } from "./upload-folder-client"

export default async function ChooseUploadFolderPage({
  params,
}: {
  params: Promise<{ spaceId: string }>
}) {
  const { spaceId } = await params

  return <UploadFolderClient spaceId={spaceId} />
}
