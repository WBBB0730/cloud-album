'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  Grid2X2,
  List,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react'

import { EmptyState } from '@/components/app/empty-state'
import { useGlobalLoading } from '@/components/app/global-loading'
import { LoadingState } from '@/components/app/loading-state'
import { MediaThumbnail } from '@/components/app/media-thumbnail'
import { MobileFrame } from '@/components/app/mobile-frame'
import { NameEditDialog } from '@/components/app/name-edit-dialog'
import { PullToRefresh } from '@/components/app/pull-to-refresh'
import { TopBar } from '@/components/app/top-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { createFolderAction } from '@/features/albums/actions'
import { getSpaceViewAction } from '@/features/app/view-actions'
import { renameSpaceAction } from '@/features/spaces/actions'
import {
  clearServerActionCache,
  useServerAction,
} from '@/hooks/use-server-action'
import {
  hasArrayField,
  hasStringField,
  isRecord,
} from '@/lib/cache-validation'

type SpaceView = 'grid' | 'list'
type SpaceViewData = Awaited<ReturnType<typeof getSpaceViewAction>>

const SPACE_VIEW_STORAGE_KEY = 'cloud-album:space-view'

const readSavedSpaceView = (): SpaceView => {
  try {
    return window.localStorage.getItem(SPACE_VIEW_STORAGE_KEY) === 'list'
      ? 'list'
      : 'grid'
  } catch {
    return 'grid'
  }
}

const writeSavedSpaceView = (view: SpaceView) => {
  try {
    window.localStorage.setItem(SPACE_VIEW_STORAGE_KEY, view)
  } catch {
    // 视图偏好保存失败不影响当前页面内切换。
  }
}

const isSpaceViewData = (value: unknown): value is SpaceViewData => {
  if (!isRecord(value)) {
    return false
  }

  const space = value.space

  return (
    isRecord(space) &&
    hasStringField(space, 'id') &&
    hasStringField(value, 'currentUserId') &&
    hasArrayField(value, 'folders')
  )
}

export function SpaceClient({ spaceId }: { spaceId: string }) {
  const router = useRouter()
  const { showLoading } = useGlobalLoading()
  const [view, setView] = useState<SpaceView>(() =>
    typeof window === 'undefined' ? 'grid' : readSavedSpaceView()
  )
  const [renameOpen, setRenameOpen] = useState(false)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const {
    data,
    error: loadError,
    loading,
    refresh,
    mutate,
  } = useServerAction(() => getSpaceViewAction(spaceId), [spaceId], {
    cacheVersion: 'space-view:v2',
    validateCacheData: isSpaceViewData,
  })
  const canRenameSpace = data
    ? data.space.createdBy === data.currentUserId
    : false

  useEffect(() => {
    writeSavedSpaceView(view)
  }, [view])

  const switchView = (nextView: SpaceView) => {
    setView(nextView)
  }

  const handleRenameSpace = async (name: string) => {
    const hideLoading = showLoading({ title: '保存中', timeoutMs: 0 })
    const formData = new FormData()
    formData.set('name', name)

    try {
      const result = await renameSpaceAction(spaceId, formData)

      if (!result.ok || !result.space) {
        return result.error
      }

      mutate((current) =>
        current
          ? {
              ...current,
              space: {
                ...current.space,
                name: result.space.name,
                updatedAt: result.space.updatedAt,
              },
            }
          : current
      )
      clearServerActionCache()
      return null
    } finally {
      hideLoading()
    }
  }

  const handleCreateFolder = async (name: string) => {
    const hideLoading = showLoading({ title: '创建中', timeoutMs: 0 })
    const formData = new FormData()
    formData.set('name', name)

    try {
      const result = await createFolderAction(spaceId, formData)

      if (!result.ok || !result.folderId) {
        return result.error ?? '创建相册失败'
      }

      clearServerActionCache()
      router.replace(`/spaces/${spaceId}/albums/${result.folderId}`)
      return null
    } finally {
      hideLoading()
    }
  }

  return (
    <MobileFrame className="ca-scroll-layout">
      <div className="ca-fixed-section">
        <TopBar
          title={
            data ? (
              data.space.name
            ) : (
              <Skeleton
                className="h-[22px] w-[min(42vw,128px)] rounded-full"
                aria-hidden="true"
              />
            )
          }
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
              {canRenameSpace ? (
                <button
                  type="button"
                  className="ca-icon-btn"
                  aria-label="修改空间名称"
                  onClick={() => setRenameOpen(true)}
                >
                  <Pencil />
                </button>
              ) : null}
              <Link
                href={`/spaces/${spaceId}/members`}
                className="ca-icon-btn"
                aria-label="成员管理"
              >
                <Users />
              </Link>
              <button
                type="button"
                className="ca-icon-btn"
                aria-label="新建相册"
                onClick={() => setCreateFolderOpen(true)}
              >
                <FolderPlus />
              </button>
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
          <button
            type="button"
            className={`ca-switch-btn ${view === 'grid' ? 'active' : ''}`}
            aria-label="卡片视图"
            onClick={() => switchView('grid')}
          >
            <Grid2X2 className="size-4" />
          </button>
          <button
            type="button"
            className={`ca-switch-btn ${view === 'list' ? 'active' : ''}`}
            aria-label="列表视图"
            onClick={() => switchView('list')}
          >
            <List className="size-4" />
          </button>
        </div>
      </div>

      <PullToRefresh onRefresh={refresh}>
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
      </PullToRefresh>

      <NameEditDialog
        initialName={data?.space.name ?? ''}
        label="空间名称"
        open={renameOpen}
        title="修改空间名称"
        onOpenChange={setRenameOpen}
        onSubmit={handleRenameSpace}
      />
      <NameEditDialog
        initialName="我的相册"
        label="相册名称"
        open={createFolderOpen}
        pendingLabel="创建中"
        submitLabel="创建"
        title="新建相册"
        onOpenChange={setCreateFolderOpen}
        onSubmit={handleCreateFolder}
      />
    </MobileFrame>
  )
}
