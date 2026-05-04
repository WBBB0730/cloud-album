import { Suspense } from 'react'

import { LoadingState } from '@/components/app/loading-state'
import { MobileFrame } from '@/components/app/mobile-frame'

import { InvitePageClient } from './page-client'

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return (
    <Suspense
      fallback={
        <MobileFrame variant="auth">
          <LoadingState />
        </MobileFrame>
      }
    >
      <InvitePageClient token={token} />
    </Suspense>
  )
}
