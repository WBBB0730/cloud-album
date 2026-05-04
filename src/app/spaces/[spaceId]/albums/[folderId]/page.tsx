import { Suspense } from 'react'

import { LoadingState } from '@/components/app/loading-state'
import { MobileFrame } from '@/components/app/mobile-frame'

import { FolderPageClient } from './page-client'

export default async function FolderPage({
  params,
}: {
  params: Promise<{ spaceId: string; folderId: string }>
}) {
  const { spaceId, folderId } = await params

  return (
    <Suspense
      fallback={
        <MobileFrame>
          <LoadingState />
        </MobileFrame>
      }
    >
      <FolderPageClient spaceId={spaceId} folderId={folderId} />
    </Suspense>
  )
}
