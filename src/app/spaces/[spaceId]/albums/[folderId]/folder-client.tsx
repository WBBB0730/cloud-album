"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowUp, ChevronLeft, Play, Trash2, Upload } from "lucide-react"

import { EmptyState } from "@/components/app/empty-state"
import { LoadingState } from "@/components/app/loading-state"
import { MediaPreviewOverlay } from "@/components/app/media-preview-overlay"
import { MediaThumbnail } from "@/components/app/media-thumbnail"
import { MobileFrame } from "@/components/app/mobile-frame"
import { TopBar } from "@/components/app/top-bar"
import { deleteMediaAction } from "@/features/albums/actions"
import { getFolderViewAction } from "@/features/app/view-actions"
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
  const [stableMedia, setStableMedia] = useState<FolderMediaItem[]>([])
  const stableMediaRef = useRef<FolderMediaItem[]>([])
  const latestMediaRef = useRef<FolderMediaItem[]>([])
  const preloadGenerationRef = useRef(0)
  const previewIndexRef = useRef<number | null>(null)
  const closingPreviewRef = useRef(false)
  const lastForegroundRefreshRef = useRef(0)
  const { data, error, loading, refresh } = useServerAction(
    () => getFolderViewAction(spaceId, folderId),
    [spaceId, folderId]
  )
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
      window.setTimeout(() => window.history.back(), 0)
    }
  }, [])

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
            <Link href={`/spaces/${spaceId}`} className="ca-icon-btn" aria-label="返回">
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
      </div>

      <div className="ca-scroll-section">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <EmptyState title={error} />
        ) : data ? (
          visibleMedia.length > 0 ? (
            <div className="ca-media-groups">
              {mediaGroups.map((group) => (
                <section key={group.key} className="ca-media-group">
                  <h2>{group.title}</h2>
                  <div className="ca-media-grid">
                    {group.media.map((item) => {
                      const deleteAction = deleteMediaAction.bind(null, spaceId, folderId, item.id)
                      const index = visibleMedia.findIndex((media) => media.id === item.id)

                      return (
                        <div key={item.id} className="ca-media group">
                          <button
                            type="button"
                            className="absolute inset-0 text-left"
                            onClick={() => openPreview(index)}
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
                          </button>
                          <form action={deleteAction} className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button className="grid size-5 place-items-center rounded-full bg-[#0f9f8f] text-white" aria-label="删除媒体">
                              <Trash2 className="size-3" />
                            </button>
                          </form>
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
        />
      ) : null}
    </MobileFrame>
  )
}
