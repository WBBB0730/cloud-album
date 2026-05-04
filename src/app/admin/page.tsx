'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

import { LoadingState } from '@/components/app/loading-state'
import { MobileFrame } from '@/components/app/mobile-frame'

import { AdminClient } from './admin-client'

function AdminPageContent() {
  const searchParams = useSearchParams()
  const queryTab = searchParams.get('tab')
  const tab =
    queryTab === 'users' || queryTab === 'spaces' || queryTab === 'deleted'
      ? queryTab
      : 'invites'

  return (
    <AdminClient
      tab={tab}
      error={searchParams.get('error') ?? undefined}
      invite={searchParams.get('invite') ?? undefined}
    />
  )
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <MobileFrame>
          <LoadingState />
        </MobileFrame>
      }
    >
      <AdminPageContent />
    </Suspense>
  )
}
