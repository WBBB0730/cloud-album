'use client'

import Link from 'next/link'
import {
  type FormEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  Copy,
  Download,
  FolderPlus,
  Pencil,
  Play,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { EmptyState } from '@/components/app/empty-state'
import { useGlobalLoading } from '@/components/app/global-loading'
import { LoadingState } from '@/components/app/loading-state'
import { MediaPreviewOverlay } from '@/components/app/media-preview-overlay'
import { MediaThumbnail } from '@/components/app/media-thumbnail'
import { MobileFrame } from '@/components/app/mobile-frame'
import { NameEditDialog } from '@/components/app/name-edit-dialog'
import { PullToRefresh } from '@/components/app/pull-to-refresh'
import { TopBar } from '@/components/app/top-bar'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  createFolderAction,
  copyMediaBatchAction,
  deleteMediaBatchAction,
  getCopyTargetFoldersAction,
  renameFolderAction,
  setFolderCoverAction,
} from '@/features/albums/actions'
import { getFolderViewAction } from '@/features/app/view-actions'
import { useFixedBackNavigation } from '@/hooks/use-fixed-back-navigation'
import { useMediaSelection } from '@/hooks/use-media-selection'
import {
  clearServerActionCache,
  useServerAction,
} from '@/hooks/use-server-action'
import { formatDuration } from '@/lib/format'
import {
  getSignedUrlExpiresAt,
  isSignedUrlUsable,
  SIGNED_URL_REFRESH_WINDOW_MS,
} from '@/lib/signed-url'

const PREVIEW_HISTORY_KEY = '__cloudAlbumPreview'
const PREVIEW_HASH = '#preview'
const FOREGROUND_REFRESH_DEBOUNCE_MS = 10_000
const IMAGE_PRELOAD_CONCURRENCY = 3

type FolderViewData = Awaited<ReturnType<typeof getFolderViewAction>>
type FolderMediaItem = FolderViewData['media'][number]
type CopyTargetFolder = Awaited<
  ReturnType<typeof getCopyTargetFoldersAction>
>['folders'][number]
type MediaFilterType = 'all' | 'image' | 'video'
type MediaSortType = 'desc' | 'asc'
type MediaPointerHandlers = ReturnType<
  typeof useMediaSelection
>['getMediaPointerHandlers']

const ALBUM_SORT_STORAGE_KEY = 'cloud-album:album-sort'

const readSavedAlbumSort = (): MediaSortType => {
  try {
    return window.localStorage.getItem(ALBUM_SORT_STORAGE_KEY) === 'asc'
      ? 'asc'
      : 'desc'
  } catch {
    return 'desc'
  }
}

const writeSavedAlbumSort = (sort: MediaSortType) => {
  try {
    window.localStorage.setItem(ALBUM_SORT_STORAGE_KEY, sort)
  } catch {
    // 排序偏好保存失败不影响当前页面内切换。
  }
}

const formatDateGroup = (date: Date | string | null | undefined) => {
  if (!date) {
    return '未知日期'
  }

  const value = new Date(date)

  if (Number.isNaN(value.getTime())) {
    return '未知日期'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(value)
}

const groupMediaByDate = (media: FolderMediaItem[]) => {
  const groups: { key: string; title: string; media: FolderMediaItem[] }[] = []
  const groupMap = new Map<
    string,
    { key: string; title: string; media: FolderMediaItem[] }
  >()

  for (const item of media) {
    const rawDate = item.takenAt ?? item.createdAt
    const value = rawDate ? new Date(rawDate) : null
    const key =
      value && !Number.isNaN(value.getTime())
        ? value.toISOString().slice(0, 10)
        : 'unknown'
    const title = formatDateGroup(value)
    let group = groupMap.get(key)

    if (!group) {
      group = { key, title, media: [] }
      groupMap.set(key, group)
      groups.push(group)
    }

    group.media.push(item)
  }

  return groups
}

const getMediaTime = (item: FolderMediaItem) => {
  const value = new Date(item.takenAt ?? item.createdAt)

  return Number.isNaN(value.getTime()) ? 0 : value.getTime()
}

const keepStableMediaUrls = (
  nextMedia: FolderMediaItem[],
  previousMedia: FolderMediaItem[]
) => {
  const previousItems = new Map(previousMedia.map((item) => [item.id, item]))
  let changed = nextMedia.length !== previousMedia.length

  const mergedMedia = nextMedia.map((item, index) => {
    const previousItem = previousItems.get(item.id)
    const previousUrl = previousItem?.url
    const nextItem = {
      ...item,
      url:
        previousUrl && isSignedUrlUsable(previousUrl) ? previousUrl : item.url,
    }

    if (previousItem && areRecordsEqual(previousItem, nextItem)) {
      if (previousMedia[index] !== previousItem) {
        changed = true
      }

      return previousItem
    }

    changed = true
    return nextItem
  })

  return changed ? mergedMedia : previousMedia
}

const getDateTime = (value: unknown) => {
  if (value === null || value === undefined) {
    return null
  }

  const date = value instanceof Date ? value : new Date(String(value))
  const time = date.getTime()

  return Number.isNaN(time) ? null : time
}

const areFieldValuesEqual = (key: string, current: unknown, next: unknown) => {
  if (key.endsWith('At')) {
    return getDateTime(current) === getDateTime(next)
  }

  return Object.is(current, next)
}

const areRecordsEqual = <T extends Record<string, unknown>>(
  current: T,
  next: T
) => {
  const currentKeys = Object.keys(current)
  const nextKeys = Object.keys(next)

  if (currentKeys.length !== nextKeys.length) {
    return false
  }

  return currentKeys.every((key) =>
    areFieldValuesEqual(key, current[key], next[key])
  )
}

const mergeRecords = <T extends Record<string, unknown>>(
  current: T,
  next: T
) => (areRecordsEqual(current, next) ? current : next)

const mergeExactMedia = (
  currentMedia: FolderMediaItem[],
  nextMedia: FolderMediaItem[]
) => {
  const currentItems = new Map(currentMedia.map((item) => [item.id, item]))
  let changed = currentMedia.length !== nextMedia.length

  const mergedMedia = nextMedia.map((item, index) => {
    const currentItem = currentItems.get(item.id)

    if (currentItem && areRecordsEqual(currentItem, item)) {
      if (currentMedia[index] !== currentItem) {
        changed = true
      }

      return currentItem
    }

    changed = true
    return item
  })

  return changed ? mergedMedia : currentMedia
}

const mergeFolderViewData = (
  current: FolderViewData | null,
  fresh: FolderViewData
): FolderViewData => {
  if (!current) {
    return fresh
  }

  const space = mergeRecords(current.space, fresh.space)
  const folder = mergeRecords(current.folder, fresh.folder)
  const media = mergeExactMedia(current.media, fresh.media)

  if (
    space === current.space &&
    folder === current.folder &&
    media === current.media
  ) {
    return current
  }

  return { ...fresh, space, folder, media }
}

const getVisibleMedia = (
  media: FolderMediaItem[],
  type: MediaFilterType,
  sort: MediaSortType
) =>
  media
    .filter((item) => type === 'all' || item.type === type)
    .toSorted((a, b) => {
      const direction = sort === 'asc' ? 1 : -1
      const timeDelta = getMediaTime(a) - getMediaTime(b)

      if (timeDelta !== 0) {
        return timeDelta * direction
      }

      return a.id.localeCompare(b.id) * direction
    })

const getNextSignedUrlRefreshDelay = (media: FolderMediaItem[]) => {
  const expiresAtList = media
    .map((item) => getSignedUrlExpiresAt(item.url))
    .filter((expiresAt): expiresAt is number => expiresAt !== null)

  if (expiresAtList.length === 0) {
    return null
  }

  const nextRefreshAt =
    Math.min(...expiresAtList) - SIGNED_URL_REFRESH_WINDOW_MS

  return Math.max(0, nextRefreshAt - Date.now())
}

const hasExpiringSignedUrl = (media: FolderMediaItem[]) =>
  media.some((item) => !isSignedUrlUsable(item.url))

const preloadImage = (url: string) =>
  new Promise<void>((resolve, reject) => {
    const image = new Image()

    image.decoding = 'async'
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('图片预加载失败'))
    image.src = url
  })

const runImagePreloadQueue = async (
  items: FolderMediaItem[],
  onPreloaded: (item: FolderMediaItem) => void,
  shouldContinue: () => boolean
) => {
  let cursor = 0

  const runWorker = async () => {
    while (shouldContinue()) {
      const item = items[cursor]
      cursor += 1

      if (!item) {
        return
      }

      try {
        await preloadImage(item.url)

        if (shouldContinue()) {
          onPreloaded(item)
        }
      } catch {
        // 下一轮数据刷新或打开图片时还会再尝试，不阻塞当前列表显示。
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(IMAGE_PRELOAD_CONCURRENCY, items.length) },
      runWorker
    )
  )
}

const downloadMediaItem = async (
  item: Pick<FolderMediaItem, 'filename' | 'url'>
) => {
  try {
    const response = await fetch(item.url)

    if (!response.ok) {
      throw new Error('下载失败')
    }

    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = objectUrl
    link.download = item.filename
    link.click()
    URL.revokeObjectURL(objectUrl)
  } catch {
    window.open(item.url, '_blank', 'noopener,noreferrer')
  }
}

const waitForNextFrame = () =>
  new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })

const FolderMediaGridItem = memo(function FolderMediaGridItem({
  consumeClickSuppression,
  getMediaPointerHandlers,
  index,
  item,
  onOpenPreview,
  onRefreshMediaUrl,
  onToggleSelection,
  selected,
  selectionMode,
}: {
  consumeClickSuppression: () => boolean
  getMediaPointerHandlers: MediaPointerHandlers
  index: number
  item: FolderMediaItem
  onOpenPreview: (index: number) => void
  onRefreshMediaUrl: (mediaId: string) => void
  onToggleSelection: (mediaId: string) => void
  selected: boolean
  selectionMode: boolean
}) {
  return (
    <div className={`ca-media group ${selected ? 'selected' : ''}`}>
      <button
        type="button"
        className="absolute inset-0 text-left"
        {...getMediaPointerHandlers(item.id, selected)}
        onClick={() => {
          if (consumeClickSuppression()) {
            return
          }

          if (selectionMode) {
            onToggleSelection(item.id)
            return
          }

          onOpenPreview(index)
        }}
      >
        <MediaThumbnail
          src={item.thumbnailUrl ?? item.url}
          alt={item.filename}
          type={item.type}
          sizes="33vw"
          onError={() => onRefreshMediaUrl(item.id)}
        />
        {item.type === 'video' ? (
          <span className="ca-play">
            <Play className="size-[9px] fill-white" />
            {formatDuration(item.duration)}
          </span>
        ) : null}
        {selectionMode ? (
          <span className={`ca-select-mark ${selected ? 'active' : ''}`}>
            {selected ? <Check /> : null}
          </span>
        ) : null}
      </button>
    </div>
  )
})

export function FolderClient({
  spaceId,
  folderId,
}: {
  spaceId: string
  folderId: string
}) {
  const [type, setType] = useState<MediaFilterType>('all')
  const [sort, setSort] = useState<MediaSortType>(() =>
    typeof window === 'undefined' ? 'desc' : readSavedAlbumSort()
  )
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [previewMedia, setPreviewMedia] = useState<FolderMediaItem[]>([])
  const [renameOpen, setRenameOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyMediaIds, setCopyMediaIds] = useState<string[]>([])
  const [copyTargetFolders, setCopyTargetFolders] = useState<
    CopyTargetFolder[]
  >([])
  const [copyTargetFolderId, setCopyTargetFolderId] = useState('')
  const [copyTargetsLoading, setCopyTargetsLoading] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [copyCreateOpen, setCopyCreateOpen] = useState(false)
  const [copyCreateName, setCopyCreateName] = useState('我的相册')
  const [copyCreatePending, setCopyCreatePending] = useState(false)
  const [copyCreateError, setCopyCreateError] = useState<string | null>(null)
  const [closingPreviewHistory, setClosingPreviewHistory] = useState(false)
  const [stableMedia, setStableMedia] = useState<FolderMediaItem[]>([])
  const stableMediaRef = useRef<FolderMediaItem[]>([])
  const latestMediaRef = useRef<FolderMediaItem[]>([])
  const preloadGenerationRef = useRef(0)
  const previewIndexRef = useRef<number | null>(null)
  const closingPreviewRef = useRef(false)
  const lastForegroundRefreshRef = useRef(0)
  const { showLoading } = useGlobalLoading()
  const { data, error, loading, refresh, mutate } = useServerAction(
    () => getFolderViewAction(spaceId, folderId),
    [spaceId, folderId],
    {
      getCacheData: (_merged, fresh) => fresh,
      mergeData: mergeFolderViewData,
    }
  )
  const nextSort = sort === 'desc' ? 'asc' : 'desc'
  const SortIcon = sort === 'desc' ? ArrowDown : ArrowUp
  const canRenameFolder = data
    ? data.space.createdBy === data.currentUserId
    : false

  useEffect(() => {
    writeSavedAlbumSort(sort)
  }, [sort])

  useEffect(() => {
    stableMediaRef.current = stableMedia
  }, [stableMedia])

  useEffect(() => {
    const generation = preloadGenerationRef.current + 1
    preloadGenerationRef.current = generation

    if (!data) {
      latestMediaRef.current = []
      setStableMedia([])
      return () => {
        if (preloadGenerationRef.current === generation) {
          preloadGenerationRef.current += 1
        }
      }
    }

    const previousMedia = stableMediaRef.current
    const previousById = new Map(previousMedia.map((item) => [item.id, item]))
    const preloadItems = data.media.filter((item) => {
      const previousItem = previousById.get(item.id)

      return (
        item.type === 'image' &&
        previousItem?.url &&
        previousItem.url !== item.url &&
        isSignedUrlUsable(previousItem.url) &&
        isSignedUrlUsable(item.url)
      )
    })

    latestMediaRef.current = data.media
    setStableMedia(keepStableMediaUrls(data.media, previousMedia))

    if (preloadItems.length > 0) {
      void runImagePreloadQueue(
        preloadItems,
        (item) => {
          setStableMedia((currentMedia) =>
            currentMedia.map((currentItem) => {
              const latestItem = latestMediaRef.current.find(
                (latest) => latest.id === currentItem.id
              )

              return currentItem.id === item.id && latestItem?.url === item.url
                ? { ...currentItem, url: item.url }
                : currentItem
            })
          )
        },
        () => preloadGenerationRef.current === generation
      )
    }

    return () => {
      if (preloadGenerationRef.current === generation) {
        preloadGenerationRef.current += 1
      }
    }
  }, [data])

  const refreshMediaUrl = useCallback((mediaId: string) => {
    const latestItem = latestMediaRef.current.find(
      (item) => item.id === mediaId
    )

    if (!latestItem) {
      return
    }

    setStableMedia((currentMedia) =>
      currentMedia.map((item) =>
        item.id === mediaId ? { ...item, url: latestItem.url } : item
      )
    )
  }, [])

  const refreshExpiredUrls = useCallback(async () => {
    if (stableMedia.length === 0 || !hasExpiringSignedUrl(stableMedia)) {
      return null
    }

    return refresh()
  }, [refresh, stableMedia])

  const refreshExpiredUrlsWithDebounce = useCallback(() => {
    const now = Date.now()

    if (
      now - lastForegroundRefreshRef.current <
      FOREGROUND_REFRESH_DEBOUNCE_MS
    ) {
      return
    }

    if (!hasExpiringSignedUrl(stableMedia)) {
      return
    }

    lastForegroundRefreshRef.current = now
    void refresh()
  }, [refresh, stableMedia])

  const visibleMedia = useMemo(() => {
    if (!data) {
      return []
    }

    return getVisibleMedia(stableMedia, type, sort)
  }, [data, sort, stableMedia, type])
  const visibleMediaIndexById = useMemo(
    () => new Map(visibleMedia.map((item, index) => [item.id, index])),
    [visibleMedia]
  )
  const mediaGroups = useMemo(
    () => groupMediaByDate(visibleMedia),
    [visibleMedia]
  )
  const mediaSelectionIds = useMemo(
    () => visibleMedia.map((item) => item.id),
    [visibleMedia]
  )
  const {
    allSelected: allVisibleSelected,
    clearSelection,
    consumeClickSuppression,
    getMediaPointerHandlers,
    scrollSectionRef,
    selectedIds,
    selectionMode,
    setSelectedIds,
    setSelectionMode,
    toggleAllSelection,
    toggleGroupSelection,
    toggleSelection,
  } = useMediaSelection(mediaSelectionIds)
  const selectedMedia = useMemo(
    () => visibleMedia.filter((item) => selectedIds.has(item.id)),
    [selectedIds, visibleMedia]
  )
  const availableCopyTargetFolders = useMemo(
    () => copyTargetFolders.filter((folder) => folder.id !== folderId),
    [copyTargetFolders, folderId]
  )
  const { requestBack } = useFixedBackNavigation(`/spaces/${spaceId}`, {
    enabled: previewIndex === null && !closingPreviewHistory,
    blocking: selectionMode,
    onBlockedBack: clearSelection,
  })
  const handleDeleteMedia = useCallback(
    async (mediaIds: string[]) => {
      const uniqueIds = Array.from(new Set(mediaIds))

      if (uniqueIds.length === 0) {
        return false
      }

      const deletedIds = new Set(uniqueIds)
      const hideLoading = showLoading({ title: '删除中', timeoutMs: 0 })

      try {
        await waitForNextFrame()
        const result = await deleteMediaBatchAction(
          spaceId,
          folderId,
          uniqueIds
        )

        if (!result.ok) {
          toast.error(result.error)
          return false
        }

        latestMediaRef.current = latestMediaRef.current.filter(
          (item) => !deletedIds.has(item.id)
        )
        mutate((current) =>
          current
            ? {
                ...current,
                media: current.media.filter((item) => !deletedIds.has(item.id)),
              }
            : current
        )
        setStableMedia((currentMedia) =>
          currentMedia.filter((item) => !deletedIds.has(item.id))
        )
        setPreviewMedia((currentMedia) =>
          currentMedia.filter((item) => !deletedIds.has(item.id))
        )
        setSelectedIds(new Set())
        setSelectionMode(false)
        return true
      } finally {
        hideLoading()
      }
    },
    [folderId, mutate, showLoading, spaceId]
  )
  const handleDeleteSelected = useCallback(() => {
    const ids = selectedMedia.map((item) => item.id)

    void handleDeleteMedia(ids)
  }, [handleDeleteMedia, selectedMedia])
  const handleDownloadSelected = useCallback(async () => {
    if (selectedMedia.length === 0) {
      return
    }

    const hideLoading = showLoading({ title: '下载中', timeoutMs: 0 })

    try {
      await waitForNextFrame()

      for (const item of selectedMedia) {
        await downloadMediaItem(item)
      }

      clearSelection()
    } finally {
      hideLoading()
    }
  }, [clearSelection, selectedMedia, showLoading])
  const handleOpenCopyDialog = useCallback(async (mediaIds?: string[]) => {
    const nextMediaIds = mediaIds ?? selectedMedia.map((item) => item.id)

    if (nextMediaIds.length === 0) {
      return
    }

    setCopyMediaIds(nextMediaIds)
    setCopyOpen(true)
    setCopyError(null)
    setCopyCreateOpen(false)
    setCopyCreateName('我的相册')
    setCopyCreateError(null)
    setCopyTargetsLoading(true)

    try {
      const result = await getCopyTargetFoldersAction(spaceId)

      if (!result.ok) {
        setCopyError(result.error)
        setCopyTargetFolders([])
        setCopyTargetFolderId('')
        return
      }

      const folders = result.folders
      const targets = folders.filter((folder) => folder.id !== folderId)

      setCopyTargetFolders(folders)
      setCopyTargetFolderId((current) =>
        targets.some((folder) => folder.id === current)
          ? current
          : (targets[0]?.id ?? '')
      )
    } finally {
      setCopyTargetsLoading(false)
    }
  }, [folderId, selectedMedia, spaceId])
  const handleCreateCopyTarget = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      if (copyCreatePending) {
        return
      }

      setCopyCreatePending(true)
      setCopyCreateError(null)

      const formData = new FormData()
      formData.set('name', copyCreateName)

      try {
        const result = await createFolderAction(spaceId, formData)

        if (!result.ok || !result.folderId) {
          setCopyCreateError(result.error ?? '创建相册失败')
          return
        }

        const folderName = copyCreateName.trim() || '我的相册'
        const createdFolder = {
          id: result.folderId,
          name: folderName,
          mediaCount: 0,
        }

        setCopyTargetFolders((current) => [createdFolder, ...current])
        setCopyTargetFolderId(result.folderId)
        setCopyCreateOpen(false)
        setCopyCreateName('我的相册')
        clearServerActionCache()
      } finally {
        setCopyCreatePending(false)
      }
    },
    [copyCreateName, copyCreatePending, spaceId]
  )
  const handleCopySelected = useCallback(async () => {
    if (copyMediaIds.length === 0 || !copyTargetFolderId) {
      return
    }

    const hideLoading = showLoading({ title: '复制中', timeoutMs: 0 })
    let nextToast: { message: string; type: 'error' | 'success' } | null = null

    try {
      await waitForNextFrame()
      const result = await copyMediaBatchAction(
        spaceId,
        folderId,
        copyTargetFolderId,
        copyMediaIds
      )

      if (!result.ok) {
        nextToast = { type: 'error', message: result.error ?? '复制失败' }
      } else {
        if (result.copiedCount > 0 && result.skippedCount > 0) {
          nextToast = {
            type: 'success',
            message: `已复制 ${result.copiedCount} 项，跳过 ${result.skippedCount} 项重复媒体`,
          }
        } else if (result.copiedCount > 0) {
          nextToast = {
            type: 'success',
            message: `已复制 ${result.copiedCount} 项`,
          }
        } else {
          nextToast = {
            type: 'success',
            message: '所选媒体已存在于目标相册',
          }
        }

        setCopyOpen(false)
        clearSelection()
        clearServerActionCache()
      }
    } finally {
      hideLoading()
    }

    if (nextToast?.type === 'error') {
      toast.error(nextToast.message)
    } else if (nextToast) {
      toast.success(nextToast.message)
    }
  }, [
    clearSelection,
    copyMediaIds,
    copyTargetFolderId,
    folderId,
    showLoading,
    spaceId,
  ])
  const handleSetCover = useCallback(
    async (mediaId: string) => {
      const hideLoading = showLoading({ title: '设置中', timeoutMs: 0 })

      try {
        const result = await setFolderCoverAction(spaceId, folderId, mediaId)

        if (!result.ok) {
          toast.error(result.error)
          return
        }

        await refresh()
      } finally {
        hideLoading()
      }
    },
    [folderId, refresh, showLoading, spaceId]
  )
  const handleRenameFolder = useCallback(
    async (name: string) => {
      const hideLoading = showLoading({ title: '保存中', timeoutMs: 0 })
      const formData = new FormData()
      formData.set('name', name)

      try {
        const result = await renameFolderAction(spaceId, folderId, formData)

        if (!result.ok || !result.folder) {
          return result.error
        }

        mutate((current) =>
          current
            ? {
                ...current,
                folder: {
                  ...current.folder,
                  name: result.folder.name,
                  updatedAt: result.folder.updatedAt,
                },
              }
            : current
        )
        clearServerActionCache()
        return null
      } finally {
        hideLoading()
      }
    },
    [folderId, mutate, showLoading, spaceId]
  )
  const openPreview = useCallback(
    async (index: number) => {
      let previewList = visibleMedia
      let previewStartIndex = index
      const targetItem = previewList[index]

      if (targetItem && !isSignedUrlUsable(targetItem.url)) {
        const refreshedData = await refreshExpiredUrls()

        if (refreshedData) {
          latestMediaRef.current = refreshedData.media

          const nextStableMedia = keepStableMediaUrls(
            refreshedData.media,
            stableMedia
          )
          const nextVisibleMedia = getVisibleMedia(nextStableMedia, type, sort)
          const nextIndex = nextVisibleMedia.findIndex(
            (item) => item.id === targetItem.id
          )

          setStableMedia(nextStableMedia)
          previewList = nextVisibleMedia
          previewStartIndex =
            nextIndex >= 0
              ? nextIndex
              : Math.min(index, nextVisibleMedia.length - 1)
        }
      }

      if (previewStartIndex < 0 || previewList.length === 0) {
        return
      }

      if (previewIndexRef.current === null) {
        const url = new URL(window.location.href)
        url.hash = PREVIEW_HASH.slice(1)

        window.history.pushState(
          {
            ...(window.history.state ?? {}),
            [PREVIEW_HISTORY_KEY]: true,
          },
          '',
          url
        )
      }

      setPreviewMedia(previewList)
      previewIndexRef.current = previewStartIndex
      setPreviewIndex(previewStartIndex)
    },
    [refreshExpiredUrls, sort, stableMedia, type, visibleMedia]
  )
  const handleOpenPreview = useCallback(
    (index: number) => {
      void openPreview(index)
    },
    [openPreview]
  )
  const closePreview = useCallback(() => {
    if (previewIndexRef.current === null) {
      return
    }

    previewIndexRef.current = null
    setPreviewIndex(null)
    setPreviewMedia([])

    if (window.history.state?.[PREVIEW_HISTORY_KEY]) {
      closingPreviewRef.current = true
      setClosingPreviewHistory(true)
      window.setTimeout(() => window.history.back(), 0)
    }
  }, [])
  const handleDeletePreviewItem = useCallback(
    async (mediaId: string) => {
      const currentPreviewMedia = previewMedia
      const currentPreviewIndex = previewIndexRef.current ?? 0
      const remainingPreviewMedia = currentPreviewMedia.filter(
        (item) => item.id !== mediaId
      )
      const deleted = await handleDeleteMedia([mediaId])

      if (!deleted) {
        return
      }

      if (remainingPreviewMedia.length === 0) {
        closePreview()
        return
      }

      const nextIndex = Math.min(
        currentPreviewIndex,
        remainingPreviewMedia.length - 1
      )

      previewIndexRef.current = nextIndex
      setPreviewIndex(nextIndex)
    },
    [closePreview, handleDeleteMedia, previewMedia]
  )

  useEffect(() => {
    previewIndexRef.current = previewIndex
  }, [previewIndex])

  useEffect(() => {
    if (previewIndexRef.current === null) {
      return
    }

    setPreviewMedia((currentMedia) => {
      const stableById = new Map(stableMedia.map((item) => [item.id, item]))

      return currentMedia.map((item) => {
        const stableItem = stableById.get(item.id)

        return stableItem && !isSignedUrlUsable(item.url) ? stableItem : item
      })
    })
  }, [stableMedia])

  useEffect(() => {
    const delay = getNextSignedUrlRefreshDelay(stableMedia)

    if (delay === null) {
      return
    }

    const timer = window.setTimeout(() => {
      void refreshExpiredUrls()
    }, delay)

    return () => window.clearTimeout(timer)
  }, [refreshExpiredUrls, stableMedia])

  useEffect(() => {
    const handleForeground = () => {
      if (document.visibilityState === 'visible') {
        refreshExpiredUrlsWithDebounce()
      }
    }

    window.addEventListener('focus', refreshExpiredUrlsWithDebounce)
    document.addEventListener('visibilitychange', handleForeground)

    return () => {
      window.removeEventListener('focus', refreshExpiredUrlsWithDebounce)
      document.removeEventListener('visibilitychange', handleForeground)
    }
  }, [refreshExpiredUrlsWithDebounce])

  useEffect(() => {
    const handlePopState = () => {
      if (closingPreviewRef.current) {
        closingPreviewRef.current = false
        setClosingPreviewHistory(false)
        return
      }

      if (previewIndexRef.current !== null) {
        previewIndexRef.current = null
        setPreviewMedia([])
        setPreviewIndex(null)
      }
    }

    window.addEventListener('popstate', handlePopState, { capture: true })
    return () =>
      window.removeEventListener('popstate', handlePopState, { capture: true })
  }, [])

  return (
    <MobileFrame className="ca-scroll-layout relative">
      <div className="ca-fixed-section">
        <TopBar
          title={
            data ? (
              data.folder.name
            ) : (
              <Skeleton
                className="h-[22px] w-[min(42vw,128px)] rounded-full"
                aria-hidden="true"
              />
            )
          }
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
          actions={
            <>
              {canRenameFolder ? (
                <button
                  type="button"
                  className="ca-icon-btn"
                  aria-label="修改相册名称"
                  onClick={() => setRenameOpen(true)}
                >
                  <Pencil />
                </button>
              ) : null}
              <Link
                href={`/spaces/${spaceId}/albums/${folderId}/upload`}
                className="ca-icon-btn"
                aria-label="上传"
              >
                <Upload />
              </Link>
            </>
          }
        />

        <div className="ca-filter-row" aria-label="排序和筛选">
          <div className="ca-segmented" aria-label="类型筛选">
            {[
              ['all', '全部'],
              ['image', '图片'],
              ['video', '视频'],
            ].map(([value, label]) => (
              <button
                key={value}
                className={`ca-chip ${type === value ? 'active' : ''}`}
                type="button"
                onClick={() => setType(value as MediaFilterType)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="ca-sort-btn"
            onClick={() => setSort(nextSort)}
          >
            拍摄时间
            <SortIcon />
          </button>
        </div>

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
              disabled={visibleMedia.length === 0}
            >
              {allVisibleSelected ? '取消全选' : '全选'}
            </button>
            <i className="ca-selection-spacer" aria-hidden="true" />
            <button
              type="button"
              className="ca-selection-icon"
              aria-label="复制到另一个相册"
              disabled={selectedIds.size === 0}
              onClick={() => {
                void handleOpenCopyDialog()
              }}
            >
              <Copy />
            </button>
            <button
              type="button"
              className="ca-selection-icon"
              aria-label="下载所选"
              disabled={selectedIds.size === 0}
              onClick={() => {
                void handleDownloadSelected()
              }}
            >
              <Download />
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="ca-selection-icon danger"
                  aria-label="删除所选"
                  disabled={selectedIds.size === 0}
                >
                  <Trash2 />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>删除所选媒体？</AlertDialogTitle>
                  <AlertDialogDescription>
                    将删除 {selectedIds.size} 项媒体，删除后会进入回收站。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="ca-confirm-footer">
                  <AlertDialogAction
                    className="ca-confirm-button ca-danger-confirm-button"
                    onClick={handleDeleteSelected}
                  >
                    删除
                  </AlertDialogAction>
                  <AlertDialogCancel className="ca-confirm-button">
                    取消
                  </AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </div>

      <PullToRefresh
        scrollRef={scrollSectionRef}
        disabled={selectionMode || previewIndex !== null}
        onRefresh={refresh}
      >
        {loading ? (
          <LoadingState />
        ) : error ? (
          <EmptyState title={error} />
        ) : data ? (
          visibleMedia.length > 0 ? (
            <div className="ca-media-groups">
              {mediaGroups.map((group) => (
                <section key={group.key} className="ca-media-group">
                  <div className="ca-media-group-head">
                    <h2>{group.title}</h2>
                    {selectionMode ? (
                      <button
                        type="button"
                        className="ca-group-select-btn"
                        onClick={() =>
                          toggleGroupSelection(
                            group.media.map((item) => item.id)
                          )
                        }
                      >
                        {group.media.every((item) => selectedIds.has(item.id))
                          ? '取消全选'
                          : '全选'}
                      </button>
                    ) : null}
                  </div>
                  <div className="ca-media-grid">
                    {group.media.map((item) => {
                      const selected = selectedIds.has(item.id)

                      return (
                        <FolderMediaGridItem
                          key={item.id}
                          consumeClickSuppression={consumeClickSuppression}
                          getMediaPointerHandlers={getMediaPointerHandlers}
                          index={visibleMediaIndexById.get(item.id) ?? 0}
                          item={item}
                          onOpenPreview={handleOpenPreview}
                          onRefreshMediaUrl={refreshMediaUrl}
                          onToggleSelection={toggleSelection}
                          selected={selected}
                          selectionMode={selectionMode}
                        />
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState title="这里还没有媒体，上传图片或视频后会按拍摄时间排列。" />
          )
        ) : null}
      </PullToRefresh>

      {data && previewIndex !== null ? (
        <MediaPreviewOverlay
          media={previewMedia}
          initialIndex={previewIndex}
          onClose={closePreview}
          onCopy={(mediaId) => handleOpenCopyDialog([mediaId])}
          onSetCover={handleSetCover}
          onDelete={handleDeletePreviewItem}
        />
      ) : null}

      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="ca-copy-dialog">
          <DialogHeader>
            <DialogTitle>复制到另一个相册</DialogTitle>
          </DialogHeader>

          <div className="ca-copy-target-list">
            {copyTargetsLoading ? (
              <div className="ca-copy-target-state">正在读取相册...</div>
            ) : copyError ? (
              <div className="ca-copy-target-state">{copyError}</div>
            ) : (
              <>
                <button
                  type="button"
                  className="ca-copy-target ca-copy-target-new"
                  onClick={() => {
                    setCopyCreateOpen((open) => !open)
                    setCopyCreateError(null)
                  }}
                >
                  <span className="ca-copy-target-new-content">
                    <FolderPlus className="ca-copy-target-leading-icon" />
                    <span className="ca-copy-target-name">新建相册</span>
                  </span>
                  <i className="ca-copy-target-check" aria-hidden="true" />
                </button>

                {copyCreateOpen ? (
                  <form
                    className="ca-copy-create-form"
                    onSubmit={handleCreateCopyTarget}
                  >
                    <Input
                      autoFocus
                      aria-label="新相册名称"
                      className="ca-input"
                      value={copyCreateName}
                      onChange={(event) =>
                        setCopyCreateName(event.target.value)
                      }
                    />
                    <button
                      type="submit"
                      className="ca-primary-btn"
                      disabled={copyCreatePending}
                    >
                      {copyCreatePending ? '创建中' : '创建'}
                    </button>
                    {copyCreateError ? (
                      <p className="ca-copy-create-error">
                        {copyCreateError}
                      </p>
                    ) : null}
                  </form>
                ) : null}

                {availableCopyTargetFolders.length > 0 ? (
                  availableCopyTargetFolders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      className={`ca-copy-target ${
                        copyTargetFolderId === folder.id ? 'active' : ''
                      }`}
                      onClick={() => setCopyTargetFolderId(folder.id)}
                    >
                      <span className="ca-copy-target-name">
                        {folder.name}
                      </span>
                      <small>{folder.mediaCount} 项</small>
                      {copyTargetFolderId === folder.id ? (
                        <Check className="ca-copy-target-check" />
                      ) : (
                        <i
                          className="ca-copy-target-check"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  ))
                ) : (
                  <div className="ca-copy-target-state">
                    没有可复制到的相册
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="ca-dialog-actions ca-copy-dialog-actions">
            <button
              type="button"
              className="ca-secondary-btn"
              onClick={() => setCopyOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="ca-primary-btn"
              disabled={
                copyTargetsLoading ||
                availableCopyTargetFolders.length === 0 ||
                !copyTargetFolderId
              }
              onClick={() => {
                void handleCopySelected()
              }}
            >
              复制
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NameEditDialog
        initialName={data?.folder.name ?? ''}
        label="相册名称"
        open={renameOpen}
        title="修改相册名称"
        onOpenChange={setRenameOpen}
        onSubmit={handleRenameFolder}
      />
    </MobileFrame>
  )
}
