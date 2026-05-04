"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { ArrowDown, ArrowUp, Check, ChevronLeft, Download, Play, Trash2, Upload, X } from "lucide-react"

import { EmptyState } from "@/components/app/empty-state"
import { ErrorBanner } from "@/components/app/error-banner"
import { useGlobalLoading } from "@/components/app/global-loading"
import { LoadingState } from "@/components/app/loading-state"
import { MediaPreviewOverlay } from "@/components/app/media-preview-overlay"
import { MediaThumbnail } from "@/components/app/media-thumbnail"
import { MobileFrame } from "@/components/app/mobile-frame"
import { TopBar } from "@/components/app/top-bar"
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
} from "@/components/ui/alert-dialog"
import { deleteMediaBatchAction } from "@/features/albums/actions"
import { getFolderViewAction } from "@/features/app/view-actions"
import { useFixedBackNavigation } from "@/hooks/use-fixed-back-navigation"
import { useServerAction } from "@/hooks/use-server-action"
import { formatDuration } from "@/lib/format"
import {
  getSignedUrlExpiresAt,
  isSignedUrlUsable,
  SIGNED_URL_REFRESH_WINDOW_MS,
} from "@/lib/signed-url"

const PREVIEW_HISTORY_KEY = "__cloudAlbumPreview"
const PREVIEW_HASH = "#preview"
const FOREGROUND_REFRESH_DEBOUNCE_MS = 10_000
const IMAGE_PRELOAD_CONCURRENCY = 3
const MULTI_SELECT_LONG_PRESS_MS = 450
const DRAG_SELECT_START_THRESHOLD = 8
const DRAG_SELECT_SCROLL_EDGE = 56
const DRAG_SELECT_MAX_SCROLL_SPEED = 12

type FolderMediaItem = {
  id: string
  type: "image" | "video"
  filename: string
  url: string
  duration: number | null
  takenAt: Date | string | null
  createdAt: Date | string
}

const formatDateGroup = (date: Date | string | null | undefined) => {
  if (!date) {
    return "未知日期"
  }

  const value = new Date(date)

  if (Number.isNaN(value.getTime())) {
    return "未知日期"
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(value)
}

const groupMediaByDate = (media: FolderMediaItem[]) => {
  const groups: { key: string; title: string; media: FolderMediaItem[] }[] = []
  const groupMap = new Map<string, { key: string; title: string; media: FolderMediaItem[] }>()

  for (const item of media) {
    const rawDate = item.takenAt ?? item.createdAt
    const value = rawDate ? new Date(rawDate) : null
    const key = value && !Number.isNaN(value.getTime()) ? value.toISOString().slice(0, 10) : "unknown"
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
  const previousUrls = new Map(previousMedia.map((item) => [item.id, item.url]))

  return nextMedia.map((item) => {
    const previousUrl = previousUrls.get(item.id)

    return {
      ...item,
      url: previousUrl && isSignedUrlUsable(previousUrl) ? previousUrl : item.url,
    }
  })
}

const getVisibleMedia = (
  media: FolderMediaItem[],
  type: "all" | "image" | "video",
  sort: "desc" | "asc"
) =>
  media
    .filter((item) => type === "all" || item.type === type)
    .toSorted((a, b) => {
      const direction = sort === "asc" ? 1 : -1
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

  const nextRefreshAt = Math.min(...expiresAtList) - SIGNED_URL_REFRESH_WINDOW_MS

  return Math.max(0, nextRefreshAt - Date.now())
}

const hasExpiringSignedUrl = (media: FolderMediaItem[]) =>
  media.some((item) => !isSignedUrlUsable(item.url))

const preloadImage = (url: string) =>
  new Promise<void>((resolve, reject) => {
    const image = new Image()

    image.decoding = "async"
    image.onload = () => resolve()
    image.onerror = () => reject(new Error("图片预加载失败"))
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
    Array.from({ length: Math.min(IMAGE_PRELOAD_CONCURRENCY, items.length) }, runWorker)
  )
}

const downloadMediaItem = async (item: Pick<FolderMediaItem, "filename" | "url">) => {
  try {
    const response = await fetch(item.url)

    if (!response.ok) {
      throw new Error("下载失败")
    }

    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement("a")

    link.href = objectUrl
    link.download = item.filename
    link.click()
    URL.revokeObjectURL(objectUrl)
  } catch {
    window.open(item.url, "_blank", "noopener,noreferrer")
  }
}

export function FolderClient({
  spaceId,
  folderId,
  type,
  sort,
}: {
  spaceId: string
  folderId: string
  type: "all" | "image" | "video"
  sort: "desc" | "asc"
}) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [previewMedia, setPreviewMedia] = useState<FolderMediaItem[]>([])
  const [closingPreviewHistory, setClosingPreviewHistory] = useState(false)
  const [stableMedia, setStableMedia] = useState<FolderMediaItem[]>([])
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const stableMediaRef = useRef<FolderMediaItem[]>([])
  const latestMediaRef = useRef<FolderMediaItem[]>([])
  const preloadGenerationRef = useRef(0)
  const scrollSectionRef = useRef<HTMLDivElement | null>(null)
  const previewIndexRef = useRef<number | null>(null)
  const closingPreviewRef = useRef(false)
  const lastForegroundRefreshRef = useRef(0)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null)
  const activeTouchIdRef = useRef<number | null>(null)
  const dragSelectRef = useRef<{
    active: boolean
    select: boolean
    anchorId: string | null
    currentId: string | null
    baseSelectedIds: Set<string>
    lastX: number
    lastY: number
    scrollFrame: number | null
  }>({
    active: false,
    select: true,
    anchorId: null,
    currentId: null,
    baseSelectedIds: new Set(),
    lastX: 0,
    lastY: 0,
    scrollFrame: null,
  })
  const pendingDragSelectRef = useRef<{
    mediaId: string
    select: boolean
    startX: number
    startY: number
  } | null>(null)
  const ignoreNextClickRef = useRef(false)
  const { showLoading } = useGlobalLoading()
  const { data, error, loading, refresh } = useServerAction(
    () => getFolderViewAction(spaceId, folderId),
    [spaceId, folderId]
  )
  useFixedBackNavigation(`/spaces/${spaceId}`, {
    enabled: previewIndex === null && !closingPreviewHistory,
  })
  const nextSort = sort === "desc" ? "asc" : "desc"
  const SortIcon = sort === "desc" ? ArrowDown : ArrowUp

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
        item.type === "image" &&
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
              const latestItem = latestMediaRef.current.find((latest) => latest.id === currentItem.id)

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
    const latestItem = latestMediaRef.current.find((item) => item.id === mediaId)

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

    if (now - lastForegroundRefreshRef.current < FOREGROUND_REFRESH_DEBOUNCE_MS) {
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
  const mediaGroups = useMemo(() => groupMediaByDate(visibleMedia), [visibleMedia])
  const selectedMedia = useMemo(
    () => visibleMedia.filter((item) => selectedIds.has(item.id)),
    [selectedIds, visibleMedia]
  )
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressStartRef.current = null
  }, [])
  const clearSelection = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
    setSelectionError(null)
  }, [])
  const getDragRangeIds = useCallback((anchorId: string, currentId: string) => {
    const anchorIndex = visibleMedia.findIndex((item) => item.id === anchorId)
    const currentIndex = visibleMedia.findIndex((item) => item.id === currentId)

    if (anchorIndex < 0 || currentIndex < 0) {
      return [anchorId]
    }

    const startIndex = Math.min(anchorIndex, currentIndex)
    const endIndex = Math.max(anchorIndex, currentIndex)

    return visibleMedia.slice(startIndex, endIndex + 1).map((item) => item.id)
  }, [visibleMedia])
  const applyDragSelectionRange = useCallback((currentId: string) => {
    const dragState = dragSelectRef.current

    if (!dragState.active || !dragState.anchorId) {
      return
    }

    const anchorId = dragState.anchorId

    setSelectionError(null)
    dragState.currentId = currentId
    setSelectedIds(() => {
      const next = new Set(dragState.baseSelectedIds)
      const rangeIds = getDragRangeIds(anchorId, currentId)

      for (const id of rangeIds) {
        if (dragState.select) {
          next.add(id)
        } else {
          next.delete(id)
        }
      }

      return next
    })
  }, [getDragRangeIds])
  const getMediaIdAtPoint = useCallback((clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY)
    const mediaElement = element?.closest<HTMLElement>("[data-media-id]")

    return mediaElement?.dataset.mediaId ?? null
  }, [])
  const stopDragAutoScroll = useCallback(() => {
    const frame = dragSelectRef.current.scrollFrame

    if (frame !== null) {
      window.cancelAnimationFrame(frame)
      dragSelectRef.current.scrollFrame = null
    }
  }, [])
  const runDragAutoScroll = useCallback(function tick() {
    const dragState = dragSelectRef.current
    const scroller = scrollSectionRef.current

    if (!dragState.active || !scroller) {
      dragState.scrollFrame = null
      return
    }

    const rect = scroller.getBoundingClientRect()
    const topDistance = dragState.lastY - rect.top
    const bottomDistance = rect.bottom - dragState.lastY
    let scrollDelta = 0

    if (topDistance >= 0 && topDistance < DRAG_SELECT_SCROLL_EDGE) {
      scrollDelta = -Math.ceil(
        ((DRAG_SELECT_SCROLL_EDGE - topDistance) / DRAG_SELECT_SCROLL_EDGE) *
          DRAG_SELECT_MAX_SCROLL_SPEED
      )
    } else if (bottomDistance >= 0 && bottomDistance < DRAG_SELECT_SCROLL_EDGE) {
      scrollDelta = Math.ceil(
        ((DRAG_SELECT_SCROLL_EDGE - bottomDistance) / DRAG_SELECT_SCROLL_EDGE) *
          DRAG_SELECT_MAX_SCROLL_SPEED
      )
    }

    if (scrollDelta !== 0) {
      scroller.scrollTop += scrollDelta
      const mediaId = getMediaIdAtPoint(dragState.lastX, dragState.lastY)

      if (mediaId && mediaId !== dragState.currentId) {
        applyDragSelectionRange(mediaId)
      }
    }

    dragState.scrollFrame = window.requestAnimationFrame(tick)
  }, [applyDragSelectionRange, getMediaIdAtPoint])
  const beginDragSelect = useCallback((mediaId: string, select: boolean, clientX: number, clientY: number) => {
    stopDragAutoScroll()
    dragSelectRef.current = {
      active: true,
      select,
      anchorId: mediaId,
      currentId: mediaId,
      baseSelectedIds: new Set(selectedIds),
      lastX: clientX,
      lastY: clientY,
      scrollFrame: null,
    }
    ignoreNextClickRef.current = true
    setSelectionMode(true)
    applyDragSelectionRange(mediaId)
    dragSelectRef.current.scrollFrame = window.requestAnimationFrame(runDragAutoScroll)
  }, [applyDragSelectionRange, runDragAutoScroll, selectedIds, stopDragAutoScroll])
  const updateDragSelect = useCallback((clientX: number, clientY: number) => {
    const dragState = dragSelectRef.current

    if (!dragState.active) {
      return false
    }

    dragState.lastX = clientX
    dragState.lastY = clientY

    const mediaId = getMediaIdAtPoint(clientX, clientY)

    if (mediaId && mediaId !== dragState.currentId) {
      applyDragSelectionRange(mediaId)
    }

    return true
  }, [applyDragSelectionRange, getMediaIdAtPoint])
  const stopDragSelect = useCallback(() => {
    dragSelectRef.current.active = false
    dragSelectRef.current.anchorId = null
    dragSelectRef.current.currentId = null
    dragSelectRef.current.baseSelectedIds = new Set()
    stopDragAutoScroll()
  }, [stopDragAutoScroll])
  const enterSelection = useCallback((mediaId: string, clientX: number, clientY: number) => {
    beginDragSelect(mediaId, true, clientX, clientY)
  }, [beginDragSelect])
  const enterSelectionOnly = useCallback((mediaId: string) => {
    ignoreNextClickRef.current = true
    setSelectionError(null)
    setSelectionMode(true)
    setSelectedIds((current) => {
      if (current.has(mediaId)) {
        return current
      }

      const next = new Set(current)

      next.add(mediaId)
      return next
    })
  }, [])
  const cancelPendingDragSelect = useCallback(() => {
    pendingDragSelectRef.current = null
  }, [])
  const stopSelectionPointers = useCallback(() => {
    cancelPendingDragSelect()
    stopDragSelect()
    clearLongPressTimer()
    activeTouchIdRef.current = null
  }, [cancelPendingDragSelect, clearLongPressTimer, stopDragSelect])
  const findActiveTouch = useCallback((touches: {
    length: number
    item: (index: number) => React.Touch | Touch | null
  }) => {
    const activeTouchId = activeTouchIdRef.current

    if (activeTouchId === null) {
      return null
    }

    for (let index = 0; index < touches.length; index += 1) {
      const touch = touches.item(index)

      if (touch?.identifier === activeTouchId) {
        return touch
      }
    }

    return null
  }, [])
  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    const pendingDragSelect = pendingDragSelectRef.current

    if (pendingDragSelect) {
      const deltaX = clientX - pendingDragSelect.startX
      const deltaY = clientY - pendingDragSelect.startY
      const absX = Math.abs(deltaX)
      const absY = Math.abs(deltaY)

      if (Math.hypot(deltaX, deltaY) < DRAG_SELECT_START_THRESHOLD) {
        return false
      }

      if (absY > absX * 1.25 && absY > 10) {
        cancelPendingDragSelect()
        return false
      }

      beginDragSelect(pendingDragSelect.mediaId, pendingDragSelect.select, clientX, clientY)
      cancelPendingDragSelect()
      updateDragSelect(clientX, clientY)
      return true
    }

    if (dragSelectRef.current.active) {
      updateDragSelect(clientX, clientY)
      return true
    }

    return false
  }, [beginDragSelect, cancelPendingDragSelect, updateDragSelect])
  const toggleSelection = useCallback((mediaId: string) => {
    setSelectionError(null)
    setSelectedIds((current) => {
      const next = new Set(current)

      if (next.has(mediaId)) {
        next.delete(mediaId)
      } else {
        next.add(mediaId)
      }

      return next
    })
  }, [])
  const toggleGroupSelection = useCallback((items: FolderMediaItem[]) => {
    setSelectionError(null)
    setSelectedIds((current) => {
      const groupIds = items.map((item) => item.id)
      const allSelected = groupIds.every((id) => current.has(id))
      const next = new Set(current)

      for (const id of groupIds) {
        if (allSelected) {
          next.delete(id)
        } else {
          next.add(id)
        }
      }

      return next
    })
  }, [])
  const scheduleLongPress = useCallback((mediaId: string, clientX: number, clientY: number) => {
    clearLongPressTimer()
    longPressStartRef.current = { x: clientX, y: clientY }
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null
      longPressStartRef.current = null
      enterSelection(mediaId, clientX, clientY)
    }, MULTI_SELECT_LONG_PRESS_MS)
  }, [clearLongPressTimer, enterSelection])
  const handleDeleteMedia = useCallback(async (mediaIds: string[]) => {
    const uniqueIds = Array.from(new Set(mediaIds))

    if (uniqueIds.length === 0) {
      return false
    }

    const hideLoading = showLoading({ title: "删除中", timeoutMs: 0 })

    try {
      const result = await deleteMediaBatchAction(spaceId, folderId, uniqueIds)

      if (!result.ok) {
        setSelectionError(result.error)
        return false
      }

      setStableMedia((currentMedia) =>
        currentMedia.filter((item) => !uniqueIds.includes(item.id))
      )
      setPreviewMedia((currentMedia) =>
        currentMedia.filter((item) => !uniqueIds.includes(item.id))
      )
      setSelectedIds(new Set())
      setSelectionMode(false)
      setSelectionError(null)
      await refresh()
      return true
    } finally {
      hideLoading()
    }
  }, [folderId, refresh, showLoading, spaceId])
  const handleDeleteSelected = useCallback(() => {
    const ids = selectedMedia.map((item) => item.id)

    startTransition(() => {
      void handleDeleteMedia(ids)
    })
  }, [handleDeleteMedia, selectedMedia, startTransition])
  const handleDownloadSelected = useCallback(async () => {
    if (selectedMedia.length === 0) {
      return
    }

    const hideLoading = showLoading({ title: "下载中", timeoutMs: 0 })

    try {
      for (const item of selectedMedia) {
        await downloadMediaItem(item)
      }
    } finally {
      hideLoading()
    }
  }, [selectedMedia, showLoading])
  const openPreview = useCallback(async (index: number) => {
    let previewList = visibleMedia
    let previewStartIndex = index
    const targetItem = previewList[index]

    if (targetItem && !isSignedUrlUsable(targetItem.url)) {
      const refreshedData = await refreshExpiredUrls()

      if (refreshedData) {
        latestMediaRef.current = refreshedData.media

        const nextStableMedia = keepStableMediaUrls(refreshedData.media, stableMedia)
        const nextVisibleMedia = getVisibleMedia(nextStableMedia, type, sort)
        const nextIndex = nextVisibleMedia.findIndex((item) => item.id === targetItem.id)

        setStableMedia(nextStableMedia)
        previewList = nextVisibleMedia
        previewStartIndex = nextIndex >= 0 ? nextIndex : Math.min(index, nextVisibleMedia.length - 1)
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
        "",
        url
      )
    }

    setPreviewMedia(previewList)
    previewIndexRef.current = previewStartIndex
    setPreviewIndex(previewStartIndex)
  }, [refreshExpiredUrls, sort, stableMedia, type, visibleMedia])
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
  const handleDeletePreviewItem = useCallback(async (mediaId: string) => {
    const deleted = await handleDeleteMedia([mediaId])

    if (deleted) {
      closePreview()
    }
  }, [closePreview, handleDeleteMedia])

  useEffect(() => {
    previewIndexRef.current = previewIndex
  }, [previewIndex])

  useEffect(() => {
    const visibleIds = new Set(visibleMedia.map((item) => item.id))

    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => visibleIds.has(id)))

      return next.size === current.size ? current : next
    })
  }, [visibleMedia])

  useEffect(() => () => stopSelectionPointers(), [stopSelectionPointers])

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
      if (document.visibilityState === "visible") {
        refreshExpiredUrlsWithDebounce()
      }
    }

    window.addEventListener("focus", refreshExpiredUrlsWithDebounce)
    document.addEventListener("visibilitychange", handleForeground)

    return () => {
      window.removeEventListener("focus", refreshExpiredUrlsWithDebounce)
      document.removeEventListener("visibilitychange", handleForeground)
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

    window.addEventListener("popstate", handlePopState, { capture: true })
    return () => window.removeEventListener("popstate", handlePopState, { capture: true })
  }, [])

  return (
    <MobileFrame className="ca-scroll-layout relative">
      <div className="ca-fixed-section">
        <TopBar
          title={data?.folder.name ?? "相册"}
          leading={
            <Link replace href={`/spaces/${spaceId}`} className="ca-icon-btn" aria-label="返回">
              <ChevronLeft />
            </Link>
          }
          actions={
            <Link href={`/spaces/${spaceId}/albums/${folderId}/upload`} className="ca-icon-btn" aria-label="上传">
              <Upload />
            </Link>
          }
        />

        <div className="ca-filter-row" aria-label="排序和筛选">
          <div className="ca-segmented" aria-label="类型筛选">
            {[
              ["all", "全部"],
              ["image", "图片"],
              ["video", "视频"],
            ].map(([value, label]) => (
              <Link key={value} href={`/spaces/${spaceId}/albums/${folderId}?type=${value}&sort=${sort}`} className={`ca-chip ${type === value ? "active" : ""}`}>
                {label}
              </Link>
            ))}
          </div>
          <Link href={`/spaces/${spaceId}/albums/${folderId}?type=${type}&sort=${nextSort}`} className="ca-sort-btn">
            拍摄时间
            <SortIcon />
          </Link>
        </div>

        {selectionMode ? (
          <div className="ca-selection-bar">
            <button type="button" className="ca-selection-icon" aria-label="取消选择" onClick={clearSelection}>
              <X />
            </button>
            <span>已选择 {selectedIds.size} 项</span>
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
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    className="ca-danger-confirm-button"
                    onClick={handleDeleteSelected}
                  >
                    删除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </div>

      <div ref={scrollSectionRef} className="ca-scroll-section">
        <ErrorBanner message={selectionError ?? undefined} />
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
                        onClick={() => toggleGroupSelection(group.media)}
                      >
                        {group.media.every((item) => selectedIds.has(item.id)) ? "取消全选" : "全选"}
                      </button>
                    ) : null}
                  </div>
                  <div className="ca-media-grid">
                    {group.media.map((item) => {
                      const index = visibleMedia.findIndex((media) => media.id === item.id)
                      const selected = selectedIds.has(item.id)

                      return (
                        <div key={item.id} className={`ca-media group ${selected ? "selected" : ""}`}>
                          <button
                            type="button"
                            className="absolute inset-0 text-left"
                            data-media-id={item.id}
                            onPointerDown={(event) => {
                              if (event.pointerType === "touch" || event.button !== 0) {
                                return
                              }

                              if (selectionMode) {
                                pendingDragSelectRef.current = {
                                  mediaId: item.id,
                                  select: !selected,
                                  startX: event.clientX,
                                  startY: event.clientY,
                                }
                                return
                              }

                              scheduleLongPress(item.id, event.clientX, event.clientY)
                            }}
                            onPointerMove={(event) => {
                              if (event.pointerType === "touch") {
                                return
                              }

                              if (handleDragMove(event.clientX, event.clientY)) {
                                event.preventDefault()
                                event.currentTarget.setPointerCapture(event.pointerId)
                                return
                              }

                              const start = longPressStartRef.current

                              if (!start) {
                                return
                              }

                              if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
                                clearLongPressTimer()
                              }
                            }}
                            onPointerUp={(event) => {
                              if (event.pointerType === "touch") {
                                return
                              }

                              const wasDragSelecting = dragSelectRef.current.active

                              stopSelectionPointers()

                              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                                event.currentTarget.releasePointerCapture(event.pointerId)
                              }

                              if (wasDragSelecting) {
                                ignoreNextClickRef.current = true
                              }
                            }}
                            onPointerCancel={(event) => {
                              if (event.pointerType === "touch") {
                                return
                              }

                              stopSelectionPointers()

                              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                                event.currentTarget.releasePointerCapture(event.pointerId)
                              }
                            }}
                            onTouchStart={(event) => {
                              if (event.touches.length !== 1) {
                                return
                              }

                              const touch = event.touches.item(0)

                              if (!touch) {
                                return
                              }

                              activeTouchIdRef.current = touch.identifier

                              if (selectionMode) {
                                pendingDragSelectRef.current = {
                                  mediaId: item.id,
                                  select: !selected,
                                  startX: touch.clientX,
                                  startY: touch.clientY,
                                }
                                return
                              }

                              scheduleLongPress(item.id, touch.clientX, touch.clientY)
                            }}
                            onTouchMove={(event) => {
                              const touch = findActiveTouch(event.touches)

                              if (!touch) {
                                return
                              }

                              if (handleDragMove(touch.clientX, touch.clientY)) {
                                if (event.cancelable) {
                                  event.preventDefault()
                                }
                                return
                              }

                              const start = longPressStartRef.current

                              if (!start) {
                                return
                              }

                              if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 10) {
                                clearLongPressTimer()
                              }
                            }}
                            onTouchEnd={(event) => {
                              if (!findActiveTouch(event.changedTouches)) {
                                return
                              }

                              const wasDragSelecting = dragSelectRef.current.active

                              stopSelectionPointers()

                              if (wasDragSelecting) {
                                ignoreNextClickRef.current = true
                              }
                            }}
                            onTouchCancel={(event) => {
                              if (!findActiveTouch(event.changedTouches)) {
                                return
                              }

                              stopSelectionPointers()
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault()
                              enterSelectionOnly(item.id)
                            }}
                            onClick={() => {
                              if (ignoreNextClickRef.current) {
                                ignoreNextClickRef.current = false
                                return
                              }

                              if (selectionMode) {
                                toggleSelection(item.id)
                                return
                              }

                              void openPreview(index)
                            }}
                          >
                            <MediaThumbnail
                              src={item.url}
                              alt={item.filename}
                              type={item.type}
                              sizes="33vw"
                              onError={() => refreshMediaUrl(item.id)}
                            />
                            {item.type === "video" ? (
                              <span className="ca-play">
                                <Play className="size-[9px] fill-white" />
                                {formatDuration(item.duration)}
                              </span>
                            ) : null}
                            {selectionMode ? (
                              <span className={`ca-select-mark ${selected ? "active" : ""}`}>
                                {selected ? <Check /> : null}
                              </span>
                            ) : null}
                          </button>
                        </div>
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
      </div>

      {data && previewIndex !== null ? (
        <MediaPreviewOverlay
          media={previewMedia}
          initialIndex={previewIndex}
          onClose={closePreview}
          onDelete={handleDeletePreviewItem}
        />
      ) : null}
    </MobileFrame>
  )
}
