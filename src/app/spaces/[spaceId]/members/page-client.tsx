'use client'

import { useFixedBackNavigation } from '@/hooks/use-fixed-back-navigation'

import { MembersClient } from './members-client'

export function MembersPageClient({ spaceId }: { spaceId: string }) {
  useFixedBackNavigation(`/spaces/${spaceId}`)

  return <MembersClient spaceId={spaceId} />
}
