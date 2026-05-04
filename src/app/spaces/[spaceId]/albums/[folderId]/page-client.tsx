'use client'

import { useSearchParams } from 'next/navigation'

import { FolderClient } from './folder-client'

export function FolderPageClient({
  spaceId,
  folderId,
}: {
  spaceId: string
  folderId: string
}) {
  const searchParams = useSearchParams()
  const queryType = searchParams.get('type')
  const querySort = searchParams.get('sort')
  const type =
    queryType === 'image' || queryType === 'video' ? queryType : 'all'
  const sort = querySort === 'asc' ? querySort : 'desc'

  return (
    <FolderClient
      spaceId={spaceId}
      folderId={folderId}
      type={type}
      sort={sort}
    />
  )
}
