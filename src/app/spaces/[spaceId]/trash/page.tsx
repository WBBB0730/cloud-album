import { TrashClient } from './trash-client'

export default async function TrashPage({
  params,
}: {
  params: Promise<{ spaceId: string }>
}) {
  const { spaceId } = await params

  return <TrashClient spaceId={spaceId} />
}
