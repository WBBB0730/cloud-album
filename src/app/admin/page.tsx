'use client'

import { Suspense } from 'react'

import { LoadingState } from '@/components/app/loading-state'
import { MobileFrame } from '@/components/app/mobile-frame'

import { AdminClient } from './admin-client'

function AdminPageContent() {
  return <AdminClient />
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
