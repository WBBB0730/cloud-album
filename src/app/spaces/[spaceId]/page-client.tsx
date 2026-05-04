'use client'

import { useFixedBackNavigation } from '@/hooks/use-fixed-back-navigation'

import { SpaceClient } from './space-client'

export function SpacePageClient({ spaceId }: { spaceId: string }) {
  useFixedBackNavigation('/spaces')

  return <SpaceClient spaceId={spaceId} />
}
