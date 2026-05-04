'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchContentRef,
} from 'react-zoom-pan-pinch'
import {
  ChevronLeft,
  Download,
  ImageIcon,
  MoreHorizontal,
  Play,
  Trash2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { isSignedUrlUsable } from '@/lib/signed-url'
import { MediaThumbnail } from './media-thumbnail'

type PreviewMediaItem = {
  id: string
  type: 'image' | 'video'
  filename: string
  url: string
}

type ImageTransformState = {
  atLeftEdge: boolean
  atRightEdge: boolean
  scale: number
}

const IMAGE_DOUBLE_CLICK_SCALE = 2.5
const IMAGE_MAX_SCALE = 10
const IMAGE_DOUBLE_TAP_INTERVAL = 280
const IMAGE_DOUBLE_TAP_DISTANCE = 28
const VIDEO_LONG_PRESS_SPEED_MS = 350
const VIDEO_LONG_PRESS_MOVE_THRESHOLD = 10
const VIDEO_FAST_RATE = 2
const VIDEO_CONTROL_HIT_AREA = 64
const PREVIEW_THUMB_ANCHOR_X = 132
const PREVIEW_THUMB_STEP = 35

const getBoundedZoomPosition = (
  position: number,
  wrapperSize: number,
  contentSize: number,
  scale: number
) => {
  const scaledSize = contentSize * scale

  if (scaledSize <= wrapperSize) {
    return (wrapperSize - scaledSize) / 2
  }

  return Math.min(0, Math.max(wrapperSize - scaledSize, position))
}

function ZoomableImage({
  src,
  alt,
  active,
  resetKey,
  onTransformStateChange,
}: {
  src: string
  alt: string
  active: boolean
  resetKey: number
  onTransformStateChange: (state: ImageTransformState) => void
}) {
  const wrapperRef = useRef<ReactZoomPanPinchContentRef | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [failed, setFailed] = useState(false)
  const lastTapRef = useRef<{
    time: number
    x: number
    y: number
  } | null>(null)

  const zoomAtPoint = (clientX: number, clientY: number) => {
    const wrapper = wrapperRef.current
    const image = imageRef.current
    const content = image?.parentElement
    const viewport = content?.parentElement

    if (!wrapper || !image || !content || !viewport) {
      return false
    }

    const imageRect = image.getBoundingClientRect()

    if (
      clientX < imageRect.left ||
      clientX > imageRect.right ||
      clientY < imageRect.top ||
      clientY > imageRect.bottom
    ) {
      return false
    }

    const { scale, positionX, positionY } = wrapper.state

    if (scale >= IMAGE_DOUBLE_CLICK_SCALE) {
      wrapper.resetTransform(180, 'easeOut')
      return true
    }

    const rect = content.getBoundingClientRect()
    const viewportRect = viewport.getBoundingClientRect()
    const contentWidth = rect.width / scale
    const contentHeight = rect.height / scale
    const imagePointX = (clientX - rect.left) / scale
    const imagePointY = (clientY - rect.top) / scale
    const scaleDifference = IMAGE_DOUBLE_CLICK_SCALE - scale
    const nextX = positionX - imagePointX * scaleDifference
    const nextY = positionY - imagePointY * scaleDifference
    const boundedX = getBoundedZoomPosition(
      nextX,
      viewportRect.width,
      contentWidth,
      IMAGE_DOUBLE_CLICK_SCALE
    )
    const boundedY = getBoundedZoomPosition(
      nextY,
      viewportRect.height,
      contentHeight,
      IMAGE_DOUBLE_CLICK_SCALE
    )

    wrapper.setTransform(
      boundedX,
      boundedY,
      IMAGE_DOUBLE_CLICK_SCALE,
      180,
      'easeOut'
    )

    return true
  }

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (zoomAtPoint(event.clientX, event.clientY)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  const handleTap = (clientX: number, clientY: number) => {
    const now = window.performance.now()
    const lastTap = lastTapRef.current

    lastTapRef.current = {
      time: now,
      x: clientX,
      y: clientY,
    }

    if (!lastTap || now - lastTap.time > IMAGE_DOUBLE_TAP_INTERVAL) {
      return false
    }

    const distance = Math.hypot(clientX - lastTap.x, clientY - lastTap.y)

    if (distance > IMAGE_DOUBLE_TAP_DISTANCE) {
      return false
    }

    if (zoomAtPoint(clientX, clientY)) {
      lastTapRef.current = null
      return true
    }

    return false
  }

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.changedTouches.length !== 1 || event.touches.length > 0) {
      return
    }

    const touch = event.changedTouches[0]

    if (handleTap(touch.clientX, touch.clientY)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  useEffect(() => {
    setFailed(false)
  }, [src])

  useEffect(() => {
    if (!active) {
      return
    }

    wrapperRef.current?.resetTransform(0)
    onTransformStateChange({ atLeftEdge: true, atRightEdge: true, scale: 1 })
  }, [active, onTransformStateChange, resetKey])

  if (failed || !isSignedUrlUsable(src)) {
    return <div className="h-full w-full bg-[#11151d]" aria-label={alt} />
  }

  return (
    <TransformWrapper
      ref={wrapperRef}
      key={src}
      minScale={1}
      maxScale={IMAGE_MAX_SCALE}
      centerOnInit
      centerZoomedOut
      limitToBounds
      doubleClick={{
        disabled: true,
      }}
      wheel={{ step: 0.16 }}
      pinch={{ step: 8 }}
      panning={{
        allowRightClickPan: false,
        velocityDisabled: false,
      }}
      onTransform={(_, state) => {
        if (!active) {
          return
        }

        const content = imageRef.current?.parentElement
        const viewport = content?.parentElement

        if (!content || !viewport) {
          onTransformStateChange({
            atLeftEdge: true,
            atRightEdge: true,
            scale: state.scale,
          })
          return
        }

        const contentWidth = content.getBoundingClientRect().width / state.scale
        const viewportWidth = viewport.getBoundingClientRect().width
        const scaledWidth = contentWidth * state.scale
        const minX = Math.min(0, viewportWidth - scaledWidth)
        const maxX =
          scaledWidth <= viewportWidth ? (viewportWidth - scaledWidth) / 2 : 0

        onTransformStateChange({
          atLeftEdge: state.positionX >= maxX - 2,
          atRightEdge: state.positionX <= minX + 2,
          scale: state.scale,
        })
      }}
    >
      <div
        className="h-full w-full"
        onDoubleClickCapture={handleDoubleClick}
        onTouchEndCapture={handleTouchEnd}
      >
        <TransformComponent
          wrapperClass="!h-full !w-full"
          wrapperStyle={{ height: '100%', width: '100%' }}
          contentStyle={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            ref={imageRef}
            src={src}
            alt={alt}
            className="max-h-full max-w-full object-contain"
            style={{
              WebkitTouchCallout: 'default',
              pointerEvents: 'auto',
              userSelect: 'auto',
            }}
            onContextMenu={(event) => event.stopPropagation()}
            onError={() => setFailed(true)}
          />
        </TransformComponent>
      </div>
    </TransformWrapper>
  )
}

function VideoPreview({
  item,
  active,
  registerVideo,
  onLongPressSpeed,
  onPlayingChange,
}: {
  item: PreviewMediaItem
  active: boolean
  registerVideo: (mediaId: string, element: HTMLVideoElement | null) => void
  onLongPressSpeed: () => void
  onPlayingChange: (mediaId: string, playing: boolean) => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const [speeding, setSpeeding] = useState(false)

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const stopSpeed = useCallback(() => {
    clearLongPressTimer()
    pointerStartRef.current = null
    setSpeeding(false)

    if (videoRef.current) {
      videoRef.current.playbackRate = 1
    }
  }, [clearLongPressTimer])

  const setVideoRef = useCallback(
    (element: HTMLVideoElement | null) => {
      videoRef.current = element
      registerVideo(item.id, element)
    },
    [item.id, registerVideo]
  )

  useEffect(() => {
    if (!active) {
      stopSpeed()
    }
  }, [active, stopSpeed])

  useEffect(
    () => () => {
      registerVideo(item.id, null)
      stopSpeed()
    },
    [item.id, registerVideo, stopSpeed]
  )

  return (
    <div className="relative flex h-full w-full items-center justify-center px-0 pt-[calc(var(--ca-safe-top)+72px)] pb-[calc(var(--ca-safe-bottom)+110px)]">
      <video
        ref={setVideoRef}
        data-media-id={item.id}
        src={item.url}
        controls={active}
        playsInline
        preload="metadata"
        className="max-h-full max-w-full bg-black object-contain"
        onPointerDown={(event) => {
          const video = videoRef.current

          if (!active || !video) {
            return
          }

          const isPlaying = !video.paused && !video.ended

          if (!isPlaying) {
            stopSpeed()
            return
          }

          const videoRect = video.getBoundingClientRect()

          if (event.clientY > videoRect.bottom - VIDEO_CONTROL_HIT_AREA) {
            return
          }

          event.preventDefault()

          pointerStartRef.current = {
            x: event.clientX,
            y: event.clientY,
          }
          clearLongPressTimer()
          longPressTimerRef.current = window.setTimeout(() => {
            const video = videoRef.current

            longPressTimerRef.current = null

            if (!video || video.paused || video.ended) {
              return
            }

            video.playbackRate = VIDEO_FAST_RATE
            setSpeeding(true)
            onLongPressSpeed()
          }, VIDEO_LONG_PRESS_SPEED_MS)
        }}
        onPointerMove={(event) => {
          const start = pointerStartRef.current

          if (!start) {
            return
          }

          if (
            videoRef.current &&
            !videoRef.current.paused &&
            !videoRef.current.ended
          ) {
            event.preventDefault()
          }

          if (
            Math.hypot(event.clientX - start.x, event.clientY - start.y) >
            VIDEO_LONG_PRESS_MOVE_THRESHOLD
          ) {
            clearLongPressTimer()
          }
        }}
        onPointerUp={stopSpeed}
        onPointerCancel={stopSpeed}
        onPointerLeave={stopSpeed}
        onContextMenu={(event) => {
          if (
            videoRef.current &&
            !videoRef.current.paused &&
            !videoRef.current.ended
          ) {
            event.preventDefault()
          }
        }}
        onPlay={() => {
          if (active) {
            onPlayingChange(item.id, true)
          }
        }}
        onEnded={() => {
          stopSpeed()
          if (active) {
            onPlayingChange(item.id, false)
          }
        }}
        onPause={() => {
          stopSpeed()
          if (active) {
            onPlayingChange(item.id, false)
          }
        }}
      />
      {speeding ? (
        <div className="pointer-events-none absolute top-[calc(var(--ca-safe-top)+92px)] left-1/2 -translate-x-1/2 rounded-full bg-white/18 px-3 py-1 text-xs font-medium text-white backdrop-blur">
          2x 快进
        </div>
      ) : null}
    </div>
  )
}

export function MediaPreviewOverlay({
  media,
  initialIndex,
  onClose,
  onSetCover,
  onDelete,
}: {
  media: PreviewMediaItem[]
  initialIndex: number
  onClose: () => void
  onSetCover?: (mediaId: string) => void | Promise<void>
  onDelete?: (mediaId: string) => void | Promise<void>
}) {
  const previewRef = useRef<HTMLDivElement | null>(null)
  const pointerStartX = useRef<number | null>(null)
  const pointerStartY = useRef<number | null>(null)
  const pointerCanTurnPageRef = useRef(false)
  const pointerMovedRef = useRef(false)
  const suppressNextTapRef = useRef(false)
  const controlsTapTimerRef = useRef<number | null>(null)
  const pendingControlsTapRef = useRef<{ x: number; y: number } | null>(null)
  const videoRefs = useRef(new Map<string, HTMLVideoElement>())
  const pauseFrameRef = useRef<number | null>(null)
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [imageTransformState, setImageTransformState] =
    useState<ImageTransformState>({
      atLeftEdge: true,
      atRightEdge: true,
      scale: 1,
    })
  const currentItem = media[currentIndex] ?? media[0]

  const registerVideo = useCallback(
    (mediaId: string, element: HTMLVideoElement | null) => {
      if (element) {
        videoRefs.current.set(mediaId, element)
        return
      }

      videoRefs.current.delete(mediaId)
    },
    []
  )

  const pauseAllVideosNow = useCallback(() => {
    const videos = new Set<HTMLVideoElement>(videoRefs.current.values())

    previewRef.current?.querySelectorAll('video').forEach((video) => {
      videos.add(video)
    })

    videos.forEach((video) => {
      video.pause()
      video.playbackRate = 1
    })
    setVideoPlaying(false)
  }, [])

  const pauseAllVideos = useCallback(() => {
    pauseAllVideosNow()

    if (pauseFrameRef.current !== null) {
      window.cancelAnimationFrame(pauseFrameRef.current)
    }

    pauseFrameRef.current = window.requestAnimationFrame(() => {
      pauseFrameRef.current = null
      pauseAllVideosNow()
    })
  }, [pauseAllVideosNow])

  const pauseInactiveVideos = useCallback((activeMediaId: string | null) => {
    videoRefs.current.forEach((video) => {
      if (video.dataset.mediaId !== activeMediaId) {
        video.pause()
        video.playbackRate = 1
      }
    })
  }, [])

  const clearPendingControlsTap = useCallback(() => {
    if (controlsTapTimerRef.current !== null) {
      window.clearTimeout(controlsTapTimerRef.current)
      controlsTapTimerRef.current = null
    }

    pendingControlsTapRef.current = null
  }, [])

  const scheduleControlsToggle = useCallback(
    (clientX: number, clientY: number) => {
      if (currentItem?.type !== 'image') {
        setControlsVisible((visible) => !visible)
        return
      }

      const pendingTap = pendingControlsTapRef.current

      if (
        pendingTap &&
        Math.hypot(clientX - pendingTap.x, clientY - pendingTap.y) <=
          IMAGE_DOUBLE_TAP_DISTANCE
      ) {
        clearPendingControlsTap()
        return
      }

      clearPendingControlsTap()
      pendingControlsTapRef.current = { x: clientX, y: clientY }
      controlsTapTimerRef.current = window.setTimeout(() => {
        controlsTapTimerRef.current = null
        pendingControlsTapRef.current = null
        setControlsVisible((visible) => !visible)
      }, IMAGE_DOUBLE_TAP_INTERVAL)
    },
    [clearPendingControlsTap, currentItem?.type]
  )

  const openIndex = (index: number) => {
    const nextIndex = Math.min(Math.max(index, 0), media.length - 1)

    clearPendingControlsTap()
    pauseAllVideos()
    setCurrentIndex(nextIndex)
    setDragOffset(0)
    setIsDragging(false)
    setVideoPlaying(false)
    setControlsVisible(true)
    setImageTransformState({ atLeftEdge: true, atRightEdge: true, scale: 1 })
  }

  const downloadCurrentItem = async () => {
    if (!currentItem) {
      return
    }

    setActionsOpen(false)

    try {
      const response = await fetch(currentItem.url)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = objectUrl
      link.download = currentItem.filename
      link.click()
      URL.revokeObjectURL(objectUrl)
    } catch {
      window.open(currentItem.url, '_blank', 'noopener,noreferrer')
    }
  }

  const finishDrag = (clientX: number) => {
    if (pointerStartX.current === null) {
      return
    }

    if (imageTransformState.scale > 1.01 && !pointerCanTurnPageRef.current) {
      pointerStartX.current = null
      setIsDragging(false)
      setDragOffset(0)
      return
    }

    const width = previewRef.current?.offsetWidth ?? 360
    const deltaX = clientX - pointerStartX.current
    const shouldTurnPage = Math.abs(deltaX) >= Math.min(96, width * 0.18)

    pointerStartX.current = null
    setIsDragging(false)
    setDragOffset(0)

    if (!shouldTurnPage) {
      return
    }

    openIndex(deltaX < 0 ? currentIndex + 1 : currentIndex - 1)
  }

  useEffect(() => {
    clearPendingControlsTap()
    setCurrentIndex(initialIndex)
    setDragOffset(0)
    setIsDragging(false)
    setVideoPlaying(false)
    setControlsVisible(true)
    setImageTransformState({ atLeftEdge: true, atRightEdge: true, scale: 1 })
  }, [clearPendingControlsTap, initialIndex])

  useEffect(() => {
    pauseAllVideos()
  }, [currentIndex, pauseAllVideos])

  useEffect(() => {
    pauseInactiveVideos(currentItem?.id ?? null)
  }, [currentItem?.id, pauseInactiveVideos])

  useEffect(
    () => () => {
      if (pauseFrameRef.current !== null) {
        window.cancelAnimationFrame(pauseFrameRef.current)
      }

      clearPendingControlsTap()
      pauseAllVideosNow()
    },
    [clearPendingControlsTap, pauseAllVideosNow]
  )

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        pauseAllVideos()
      }
    }

    const handlePageHide = () => {
      pauseAllVideos()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [pauseAllVideos])

  useEffect(() => {
    if (!controlsVisible || videoPlaying) {
      return
    }

    const timer = window.setTimeout(() => setControlsVisible(false), 5000)

    return () => window.clearTimeout(timer)
  }, [controlsVisible, currentIndex, videoPlaying])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }

      if (event.key === 'ArrowLeft') {
        openIndex(currentIndex - 1)
      }

      if (event.key === 'ArrowRight') {
        openIndex(currentIndex + 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, onClose])

  if (!currentItem) {
    return null
  }

  const previewControlsVisible = controlsVisible && !videoPlaying

  return (
    <div className="fixed inset-0 z-50 h-[var(--ca-viewport-height)] overflow-hidden bg-[#05080d] text-white">
      <header
        className={`absolute top-0 right-0 left-0 z-10 grid grid-cols-[2.5rem_1fr_2.5rem] items-center bg-black/42 px-[calc(1rem+var(--ca-safe-left))] pt-[calc(var(--ca-safe-top)+20px)] pr-[calc(1rem+var(--ca-safe-right))] pb-3 transition-opacity duration-200 ${
          previewControlsVisible
            ? 'opacity-100'
            : 'pointer-events-none opacity-0'
        }`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full text-white hover:bg-white/10 hover:text-white"
          onClick={onClose}
        >
          <ChevronLeft className="size-5" />
        </Button>
        <span className="text-center text-xs text-white/70">
          {currentIndex + 1} / {media.length}
        </span>
        <Sheet open={actionsOpen} onOpenChange={setActionsOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full bg-transparent text-white hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white data-[state=open]:bg-white/10 data-[state=open]:text-white"
            >
              <MoreHorizontal className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="rounded-t-2xl border-white/10 bg-white p-0"
            showCloseButton={false}
          >
            <SheetHeader className="border-b border-[#edf0f2] px-5 py-4 text-left">
              <SheetTitle className="truncate text-base">
                {currentItem.filename}
              </SheetTitle>
            </SheetHeader>
            <div className="grid px-5 py-2 text-[15px]">
              <button
                type="button"
                className="flex items-center gap-3 py-4 text-left"
                onClick={downloadCurrentItem}
              >
                <Download className="size-5 text-[#111827]" />
                下载
              </button>
              {onSetCover ? (
                <button
                  type="button"
                  className="flex items-center gap-3 py-4 text-left"
                  onClick={() => {
                    setActionsOpen(false)
                    void onSetCover(currentItem.id)
                  }}
                >
                  <ImageIcon className="size-5 text-[#111827]" />
                  设为封面
                </button>
              ) : null}
              {onDelete ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-3 py-4 text-left text-[#c24141]"
                    >
                      <Trash2 className="size-5" />
                      删除
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>删除这项媒体？</AlertDialogTitle>
                      <AlertDialogDescription>
                        删除后会进入回收站，可以在回收站恢复。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        className="ca-danger-confirm-button"
                        onClick={() => {
                          setActionsOpen(false)
                          void onDelete(currentItem.id)
                        }}
                      >
                        删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <div
        ref={previewRef}
        className="absolute inset-0 touch-pan-y overflow-hidden"
        onPointerDown={(event) => {
          pointerStartX.current = event.clientX
          pointerStartY.current = event.clientY
          pointerMovedRef.current = false
          pointerCanTurnPageRef.current = imageTransformState.scale <= 1.01
          setIsDragging(true)
        }}
        onPointerMove={(event) => {
          if (pointerStartX.current === null) {
            return
          }

          const moveX = event.clientX - pointerStartX.current
          const moveY = event.clientY - (pointerStartY.current ?? event.clientY)

          if (Math.hypot(moveX, moveY) > 8) {
            pointerMovedRef.current = true
          }

          if (imageTransformState.scale > 1.01) {
            const deltaX = moveX
            const canTurnFromZoomedImage =
              (deltaX > 0 && imageTransformState.atLeftEdge) ||
              (deltaX < 0 && imageTransformState.atRightEdge)

            if (!canTurnFromZoomedImage) {
              pointerCanTurnPageRef.current = false
              setDragOffset(0)
              return
            }

            pointerCanTurnPageRef.current = true
          }

          if (!pointerCanTurnPageRef.current) {
            return
          }

          const deltaX = moveX
          const atStart = currentIndex === 0 && deltaX > 0
          const atEnd = currentIndex === media.length - 1 && deltaX < 0

          setDragOffset(atStart || atEnd ? deltaX * 0.28 : deltaX)
        }}
        onPointerCancel={() => {
          clearPendingControlsTap()
          pointerStartX.current = null
          pointerStartY.current = null
          pointerCanTurnPageRef.current = false
          pointerMovedRef.current = false
          setIsDragging(false)
          setDragOffset(0)
        }}
        onPointerUp={(event) => {
          const shouldToggleControls =
            !videoPlaying &&
            !pointerMovedRef.current &&
            !suppressNextTapRef.current

          finishDrag(event.clientX)

          if (shouldToggleControls) {
            scheduleControlsToggle(event.clientX, event.clientY)
          }

          pointerStartY.current = null
          pointerMovedRef.current = false
          suppressNextTapRef.current = false
        }}
      >
        <div
          className="flex h-full will-change-transform"
          style={{
            transform: `translate3d(calc(${-currentIndex * 100}% + ${dragOffset}px), 0, 0)`,
            transition: isDragging
              ? 'none'
              : 'transform 240ms cubic-bezier(0.22, 0.8, 0.22, 1)',
          }}
        >
          {media.map((item, index) => (
            <div key={item.id} className="relative h-full w-full shrink-0">
              {item.type === 'video' ? (
                <VideoPreview
                  item={item}
                  active={index === currentIndex}
                  registerVideo={registerVideo}
                  onLongPressSpeed={() => {
                    suppressNextTapRef.current = true
                  }}
                  onPlayingChange={(mediaId, playing) => {
                    if (mediaId !== currentItem.id) {
                      return
                    }

                    setVideoPlaying(playing)

                    if (playing) {
                      setControlsVisible(false)
                    }
                  }}
                />
              ) : (
                <ZoomableImage
                  src={item.url}
                  alt={item.filename}
                  active={index === currentIndex}
                  resetKey={currentIndex}
                  onTransformStateChange={setImageTransformState}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div
        className={`absolute inset-x-0 bottom-0 overflow-hidden bg-black/38 px-[calc(1rem+var(--ca-safe-left))] py-2 pr-[calc(1rem+var(--ca-safe-right))] pb-[calc(var(--ca-safe-bottom)+18px)] transition-opacity duration-200 ${
          previewControlsVisible
            ? 'opacity-100'
            : 'pointer-events-none opacity-0'
        }`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div
          className="flex items-end gap-px transition-transform duration-200 ease-out will-change-transform"
          style={{
            transform: `translate3d(${PREVIEW_THUMB_ANCHOR_X - currentIndex * PREVIEW_THUMB_STEP}px, 0, 0)`,
          }}
        >
          {media.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={`relative shrink-0 overflow-hidden border transition-[height,width,opacity,border-radius] duration-150 ${
                item.id === currentItem.id
                  ? 'h-[58px] w-11 rounded border-white'
                  : 'h-12 w-[34px] rounded-sm border-transparent opacity-60'
              }`}
              onClick={() => openIndex(index)}
            >
              <MediaThumbnail
                src={item.url}
                alt=""
                type={item.type}
                sizes="48px"
              />
              {item.type === 'video' ? (
                <Play className="absolute right-1 bottom-1 size-3 fill-white" />
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
