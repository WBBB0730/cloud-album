'use client'

import Link from 'next/link'
import { ChevronLeft, Trash2, Undo2 } from 'lucide-react'

import { EmptyState } from '@/components/app/empty-state'
import { LoadingState } from '@/components/app/loading-state'
import { MobileFrame } from '@/components/app/mobile-frame'
import { SafeImage } from '@/components/app/safe-image'
import { TopBar } from '@/components/app/top-bar'
import { getTrashHomeViewAction } from '@/features/app/view-actions'
import {
  permanentFolderAction,
  restoreFolderAction,
} from '@/features/trash/actions'
import { useFixedBackNavigation } from '@/hooks/use-fixed-back-navigation'
import { useServerAction } from '@/hooks/use-server-action'
import { formatDateTime } from '@/lib/format'

export function TrashClient({ spaceId }: { spaceId: string }) {
  const { data, error, loading } = useServerAction(
    () => getTrashHomeViewAction(spaceId),
    [spaceId]
  )
  useFixedBackNavigation(`/spaces/${spaceId}`)

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
      <div className="ca-scroll-section">
        {loading ? <LoadingState /> : null}
        {error ? <EmptyState title={error} /> : null}
        {data ? (
          data.folders.length > 0 ? (
            <div className="ca-list">
              {data.folders.map((folder) => {
                const restoreAction = restoreFolderAction.bind(
                  null,
                  spaceId,
                  folder.id
                )
                const permanentAction = permanentFolderAction.bind(
                  null,
                  spaceId,
                  folder.id
                )

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
                      <form action={restoreAction}>
                        <button className="ca-icon-btn" aria-label="恢复相册">
                          <Undo2 className="size-4" />
                        </button>
                      </form>
                      <form action={permanentAction}>
                        <button
                          className="ca-icon-btn text-red-600"
                          aria-label="永久删除"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </form>
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
      </div>
    </MobileFrame>
  )
}
