'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Trash2, Undo2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { EmptyState } from '@/components/app/empty-state'
import { useGlobalLoading } from '@/components/app/global-loading'
import { LoadingState } from '@/components/app/loading-state'
import { MobileFrame } from '@/components/app/mobile-frame'
import { PullToRefresh } from '@/components/app/pull-to-refresh'
import { SafeImage } from '@/components/app/safe-image'
import { TopBar } from '@/components/app/top-bar'
import { getTrashHomeViewAction } from '@/features/app/view-actions'
import {
  permanentFolderAction,
  restoreFolderAction,
} from '@/features/trash/actions'
import { useFixedBackNavigation } from '@/hooks/use-fixed-back-navigation'
import { useServerAction } from '@/hooks/use-server-action'
import {
  hasArrayField,
  hasStringField,
  isRecord,
} from '@/lib/cache-validation'
import { formatDateTime } from '@/lib/format'

type TrashHomeViewData = Awaited<ReturnType<typeof getTrashHomeViewAction>>

const isTrashHomeViewData = (
  value: unknown
): value is TrashHomeViewData => {
  if (!isRecord(value)) {
    return false
  }

  const space = value.space

  return (
    isRecord(space) &&
    hasStringField(space, 'id') &&
    hasArrayField(value, 'folders')
  )
}

export function TrashClient({ spaceId }: { spaceId: string }) {
  const router = useRouter()
  const { hideLoading, showLoading } = useGlobalLoading()
  const { data, error, loading, refresh } = useServerAction(
    () => getTrashHomeViewAction(spaceId),
    [spaceId],
    {
      cacheVersion: 'trash-home-view:v1',
      validateCacheData: isTrashHomeViewData,
    }
  )
  useFixedBackNavigation(`/spaces/${spaceId}`)

  const handleRestoreFolder = async (folderId: string) => {
    const closeLoading = showLoading({ title: '恢复中', timeoutMs: 0 })

    try {
      const result = await restoreFolderAction(spaceId, folderId)

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      router.replace(`/spaces/${spaceId}`)
    } finally {
      closeLoading()
      hideLoading()
    }
  }
  const handlePermanentFolder = async (folderId: string) => {
    const closeLoading = showLoading({ title: '删除中', timeoutMs: 0 })

    try {
      const result = await permanentFolderAction(spaceId, folderId)

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      await refresh()
    } finally {
      closeLoading()
      hideLoading()
    }
  }

  return (
    <MobileFrame className="ca-scroll-layout">
      <div className="ca-fixed-section">
        <TopBar
          title="回收站"
          subtitle={data?.space.name}
          leading={
            <Link
              replace
              href={`/spaces/${spaceId}`}
              className="ca-icon-btn"
              aria-label="返回"
            >
              <ChevronLeft />
            </Link>
          }
        />
      </div>
      <PullToRefresh onRefresh={refresh}>
        {loading ? <LoadingState /> : null}
        {error ? <EmptyState title={error} /> : null}
        {data ? (
          data.folders.length > 0 ? (
            <div className="ca-list">
              {data.folders.map((folder) => {
                return (
                  <div key={folder.id} className="ca-folder-row">
                    <Link
                      href={`/spaces/${spaceId}/trash/${folder.id}`}
                      className="ca-row-cover ca-photo-a"
                    >
                      {folder.coverUrl ? (
                        <SafeImage src={folder.coverUrl} alt="" sizes="56px" />
                      ) : null}
                    </Link>
                    <Link
                      href={`/spaces/${spaceId}/trash/${folder.id}`}
                      className="min-w-0"
                    >
                      <strong>{folder.name}</strong>
                      <small>
                        {folder.deletedByName} ·{' '}
                        {formatDateTime(folder.deletedAt)} · {folder.itemCount}{' '}
                        项
                      </small>
                    </Link>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="ca-icon-btn"
                        aria-label="恢复相册"
                        onClick={() => {
                          void handleRestoreFolder(folder.id)
                        }}
                      >
                        <Undo2 className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="ca-icon-btn text-red-600"
                        aria-label="永久删除"
                        onClick={() => {
                          void handlePermanentFolder(folder.id)
                        }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState title="回收站为空">
              删除的相册和媒体会按原相册出现在这里。
            </EmptyState>
          )
        ) : null}
      </PullToRefresh>
    </MobileFrame>
  )
}
