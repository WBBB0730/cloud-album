'use client'

import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  Grid2X2,
  List,
  Trash2,
  Users,
} from 'lucide-react'

import { EmptyState } from '@/components/app/empty-state'
import { LoadingState } from '@/components/app/loading-state'
import { MediaThumbnail } from '@/components/app/media-thumbnail'
import { MobileFrame } from '@/components/app/mobile-frame'
import { TopBar } from '@/components/app/top-bar'
import { getSpaceViewAction } from '@/features/app/view-actions'
import { useServerAction } from '@/hooks/use-server-action'

export function SpaceClient({
  spaceId,
  view,
}: {
  spaceId: string
  view: 'grid' | 'list'
}) {
  const {
    data,
    error: loadError,
    loading,
  } = useServerAction(() => getSpaceViewAction(spaceId), [spaceId])

  return (
    <MobileFrame className="ca-scroll-layout">
      <div className="ca-fixed-section">
        <TopBar
          title={data?.space.name ?? '空间'}
          leading={
            <Link
              replace
              href="/spaces"
              className="ca-icon-btn"
              aria-label="返回空间"
            >
              <ChevronLeft />
            </Link>
          }
          actions={
            <>
              <Link
                href={`/spaces/${spaceId}/members`}
                className="ca-icon-btn"
                aria-label="成员管理"
              >
                <Users />
              </Link>
              <Link
                href={`/spaces/${spaceId}/albums/new`}
                className="ca-icon-btn"
                aria-label="新建相册"
              >
                <FolderPlus />
              </Link>
              <Link
                href={`/spaces/${spaceId}/trash`}
                className="ca-icon-btn"
                aria-label="回收站"
              >
                <Trash2 />
              </Link>
            </>
          }
        />

        <div className="ca-view-switch" aria-label="视图切换">
          <Link
            href={`/spaces/${spaceId}?view=grid`}
            className={`ca-switch-btn ${view === 'grid' ? 'active' : ''}`}
            aria-label="卡片视图"
          >
            <Grid2X2 className="size-4" />
          </Link>
          <Link
            href={`/spaces/${spaceId}?view=list`}
            className={`ca-switch-btn ${view === 'list' ? 'active' : ''}`}
            aria-label="列表视图"
          >
            <List className="size-4" />
          </Link>
        </div>
      </div>

      <div className="ca-scroll-section">
        {loading ? <LoadingState /> : null}
        {loadError ? <EmptyState title={loadError} /> : null}

        {data ? (
          data.folders.length === 0 ? (
            <EmptyState title="还没有相册">
              创建一级相册后开始上传图片和视频。
            </EmptyState>
          ) : view === 'grid' ? (
            <div className="ca-folder-grid">
              {data.folders.map((folder, index) => (
                <Link
                  key={folder.id}
                  href={`/spaces/${spaceId}/albums/${folder.id}`}
                  className="ca-folder-card"
                >
                  <div
                    className={`ca-cover ca-photo-${['a', 'd', 'f', 'c', 'e', 'b'][index % 6]}`}
                  >
                    {folder.coverUrl && folder.coverType ? (
                      <MediaThumbnail
                        src={folder.coverUrl}
                        alt=""
                        type={folder.coverType}
                        sizes="180px"
                      />
                    ) : null}
                  </div>
                  <strong>{folder.name}</strong>
                  <small>{folder.mediaCount} 项</small>
                </Link>
              ))}
            </div>
          ) : (
            <div className="ca-list">
              {data.folders.map((folder, index) => (
                <Link
                  key={folder.id}
                  href={`/spaces/${spaceId}/albums/${folder.id}`}
                  className="ca-folder-row"
                >
                  <span
                    className={`ca-row-cover ca-photo-${['a', 'd', 'f', 'c', 'e', 'b'][index % 6]}`}
                  >
                    {folder.coverUrl && folder.coverType ? (
                      <MediaThumbnail
                        src={folder.coverUrl}
                        alt=""
                        type={folder.coverType}
                        sizes="56px"
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <strong>{folder.name}</strong>
                    <small>{folder.mediaCount} 项</small>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )
        ) : null}
      </div>
    </MobileFrame>
  )
}
