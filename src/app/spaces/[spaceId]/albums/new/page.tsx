import { Suspense } from 'react'

import { LoadingState } from '@/components/app/loading-state'
import { MobileFrame } from '@/components/app/mobile-frame'

import { NewFolderPageClient } from './page-client'

export default async function NewFolderPage({
  params,
}: {
  params: Promise<{ spaceId: string }>
}) {
  const { spaceId } = await params

  return (
    <Suspense
      fallback={
        <MobileFrame>
          <LoadingState />
        </MobileFrame>
      }
    >
      <NewFolderPageClient spaceId={spaceId} />
    </Suspense>
  )
}
