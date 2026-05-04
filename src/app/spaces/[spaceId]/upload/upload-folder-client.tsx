'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { EmptyState } from '@/components/app/empty-state'
import { LoadingState } from '@/components/app/loading-state'
import { MobileFrame } from '@/components/app/mobile-frame'
import { PullToRefresh } from '@/components/app/pull-to-refresh'
import { TopBar } from '@/components/app/top-bar'
import { getSpaceViewAction } from '@/features/app/view-actions'
import { useFixedBackNavigation } from '@/hooks/use-fixed-back-navigation'
import { useServerAction } from '@/hooks/use-server-action'

export function UploadFolderClient({ spaceId }: { spaceId: string }) {
  const { data, error, loading, refresh } = useServerAction(
    () => getSpaceViewAction(spaceId),
    [spaceId]
  )
  useFixedBackNavigation(`/spaces/${spaceId}`)

  return (
    <MobileFrame className="ca-scroll-layout">
      <div className="ca-fixed-section">
        <TopBar
          title="选择上传位置"
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
              {data.folders.map((folder) => (
                <Link
                  key={folder.id}
                  href={`/spaces/${spaceId}/albums/${folder.id}/upload`}
                  className="ca-folder-row"
                >
                  <span className="ca-row-cover ca-photo-a" />
                  <span className="min-w-0">
                    <strong>{folder.name}</strong>
                    <small>{folder.mediaCount} 项</small>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="还没有相册">
              先创建相册，再上传图片和视频。
            </EmptyState>
          )
        ) : null}
      </PullToRefresh>
    </MobileFrame>
  )
}
