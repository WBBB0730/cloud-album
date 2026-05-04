'use client'

import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Check, ChevronLeft, Play, Trash2, Undo2, X } from 'lucide-react'

import { EmptyState } from '@/components/app/empty-state'
import { useGlobalLoading } from '@/components/app/global-loading'
import { LoadingState } from '@/components/app/loading-state'
import { MediaThumbnail } from '@/components/app/media-thumbnail'
import { MobileFrame } from '@/components/app/mobile-frame'
import { PullToRefresh } from '@/components/app/pull-to-refresh'
import { TopBar } from '@/components/app/top-bar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { getTrashFolderViewAction } from '@/features/app/view-actions'
import {
  permanentMediaBatchAction,
  restoreMediaBatchAction,
} from '@/features/trash/actions'
import { useFixedBackNavigation } from '@/hooks/use-fixed-back-navigation'
import { useMediaSelection } from '@/hooks/use-media-selection'
import { useServerAction } from '@/hooks/use-server-action'
import { formatDuration } from '@/lib/format'

type TrashMediaItem = {
  id: string
  type: 'image' | 'video'
  filename: string
  url: string
  duration: number | null
}

const waitForNextFrame = () =>
  new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })

export function TrashFolderClient({
  spaceId,
  folderId,
}: {
  spaceId: string
  folderId: string
}) {
  const { showLoading } = useGlobalLoading()
  const { data, error, loading, mutate, refresh } = useServerAction(
    () => getTrashFolderViewAction(spaceId, folderId),
    [spaceId, folderId]
  )

  const media = useMemo<TrashMediaItem[]>(() => data?.media ?? [], [data])
  const mediaSelectionIds = useMemo(() => media.map((item) => item.id), [media])
  const {
    allSelected,
    clearSelection,
    consumeClickSuppression,
    getMediaPointerHandlers,
    scrollSectionRef,
    selectedIds,
    selectionMode,
    toggleAllSelection,
    toggleSelection,
  } = useMediaSelection(mediaSelectionIds)
  const selectedMedia = useMemo(
    () => media.filter((item) => selectedIds.has(item.id)),
    [media, selectedIds]
  )
  const { requestBack } = useFixedBackNavigation(`/spaces/${spaceId}/trash`, {
    blocking: selectionMode,
    onBlockedBack: clearSelection,
  })

  const removeMediaFromPage = useCallback(
    (mediaIds: string[]) => {
      const removedIds = new Set(mediaIds)

      mutate((current) =>
        current
          ? {
              ...current,
              media: current.media.filter((item) => !removedIds.has(item.id)),
            }
          : current
      )
    },
    [mutate]
  )

  const handleRestoreSelected = useCallback(async () => {
    const ids = selectedMedia.map((item) => item.id)

    if (ids.length === 0) {
      return
    }

    const hideLoading = showLoading({ title: '恢复中', timeoutMs: 0 })

    try {
      await waitForNextFrame()
      const result = await restoreMediaBatchAction(spaceId, folderId, ids)

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      removeMediaFromPage(ids)
      clearSelection()
    } finally {
      hideLoading()
    }
  }, [
    clearSelection,
    folderId,
    removeMediaFromPage,
    selectedMedia,
    showLoading,
    spaceId,
  ])

  const handlePermanentSelected = useCallback(async () => {
    const ids = selectedMedia.map((item) => item.id)

    if (ids.length === 0) {
      return
    }

    const hideLoading = showLoading({ title: '删除中', timeoutMs: 0 })

    try {
      await waitForNextFrame()
      const result = await permanentMediaBatchAction(spaceId, folderId, ids)

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      removeMediaFromPage(ids)
      clearSelection()
    } finally {
      hideLoading()
    }
  }, [
    clearSelection,
    folderId,
    removeMediaFromPage,
    selectedMedia,
    showLoading,
    spaceId,
  ])

  return (
    <MobileFrame className="ca-scroll-layout">
      <div className="ca-fixed-section">
        <TopBar
          title={data?.folder.name ?? '回收站'}
          subtitle="回收站"
          leading={
            <button
              type="button"
              className="ca-icon-btn"
              aria-label="返回"
              onClick={() => requestBack('button')}
            >
              <ChevronLeft />
            </button>
          }
        />

        {selectionMode ? (
          <div className="ca-selection-bar">
            <button
              type="button"
              className="ca-selection-icon"
              aria-label="取消选择"
              onClick={clearSelection}
            >
              <X />
            </button>
            <span>已选择 {selectedIds.size} 项</span>
            <button
              type="button"
              className="ca-selection-text-btn"
              onClick={toggleAllSelection}
              disabled={media.length === 0}
            >
              {allSelected ? '取消全选' : '全选'}
            </button>
            <i className="ca-selection-spacer" aria-hidden="true" />
            <button
              type="button"
              className="ca-selection-icon"
              aria-label="恢复所选"
              disabled={selectedIds.size === 0}
              onClick={() => {
                void handleRestoreSelected()
              }}
            >
              <Undo2 />
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="ca-selection-icon danger"
                  aria-label="永久删除所选"
                  disabled={selectedIds.size === 0}
                >
                  <Trash2 />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>永久删除所选媒体？</AlertDialogTitle>
                  <AlertDialogDescription>
                    将永久删除 {selectedIds.size} 项媒体。此操作不会删除 COS
                    文件，但这些媒体不会再出现在回收站。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    className="ca-danger-confirm-button"
                    onClick={() => {
                      void handlePermanentSelected()
                    }}
                  >
                    永久删除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </div>
      <PullToRefresh
        scrollRef={scrollSectionRef}
        disabled={selectionMode}
        onRefresh={refresh}
      >
        {loading ? <LoadingState /> : null}
        {error ? <EmptyState title={error} /> : null}
        {data ? (
          media.length > 0 ? (
            <div className="ca-media-grid">
              {media.map((item) => {
                const selected = selectedIds.has(item.id)

                return (
                  <div
                    key={item.id}
                    className={`ca-media group ${selected ? 'selected' : ''}`}
                  >
                    <button
                      type="button"
                      className="absolute inset-0 text-left"
                      {...getMediaPointerHandlers(item.id, selected)}
                      onClick={() => {
                        if (consumeClickSuppression()) {
                          return
                        }

                        if (selectionMode) {
                          toggleSelection(item.id)
                        }
                      }}
                    >
                      <MediaThumbnail
                        src={item.url}
                        alt={item.filename}
                        type={item.type}
                        sizes="33vw"
                      />
                      {item.type === 'video' ? (
                        <span className="ca-play">
                          <Play className="size-[9px] fill-white" />
                          {formatDuration(item.duration)}
                        </span>
                      ) : null}
                      {selectionMode ? (
                        <span
                          className={`ca-select-mark ${selected ? 'active' : ''}`}
                        >
                          {selected ? <Check /> : null}
                        </span>
                      ) : null}
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState title="这个相册没有已删除媒体" />
          )
        ) : null}
      </PullToRefresh>
    </MobileFrame>
  )
}
