'use client'

import { useFixedBackNavigation } from '@/hooks/use-fixed-back-navigation'

import { NewFolderClient } from './new-folder-client'

export function NewFolderPageClient({ spaceId }: { spaceId: string }) {
  useFixedBackNavigation(`/spaces/${spaceId}`)

  return <NewFolderClient spaceId={spaceId} />
}
