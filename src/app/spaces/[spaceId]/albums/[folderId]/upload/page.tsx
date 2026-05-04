import { UploadPageClient } from "./upload-page-client"

export default async function UploadPage({
  params,
}: {
  params: Promise<{ spaceId: string; folderId: string }>
}) {
  const { spaceId, folderId } = await params

  return <UploadPageClient spaceId={spaceId} folderId={folderId} />
}
