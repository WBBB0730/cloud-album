'use client'

import { useSearchParams } from 'next/navigation'

import { useFixedBackNavigation } from '@/hooks/use-fixed-back-navigation'

import { NewFolderClient } from './new-folder-client'

export function NewFolderPageClient({ spaceId }: { spaceId: string }) {
  const searchParams = useSearchParams()

  useFixedBackNavigation(`/spaces/${spaceId}`)

  return (
    <NewFolderClient
      spaceId={spaceId}
      error={searchParams.get('error') ?? undefined}
    />
  )
}
