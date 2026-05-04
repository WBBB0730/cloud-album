'use client'

import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from 'react'

const PULL_TRIGGER_DISTANCE = 68
const PULL_MAX_DISTANCE = 96
const PULL_RESISTANCE = 0.45

type PullToRefreshProps = {
  children: ReactNode
  className?: string
  disabled?: boolean
  onRefresh: () => Promise<unknown>
  scrollRef?: {
    current: HTMLDivElement | null
  }
}

export function PullToRefresh({
  children,
  className = '',
  disabled = false,
  onRefresh,
  scrollRef,
}: PullToRefreshProps) {
  const localScrollRef = useRef<HTMLDivElement | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const pullingRef = useRef(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const setScrollElement = useCallback(
    (node: HTMLDivElement | null) => {
      localScrollRef.current = node

      if (scrollRef) {
        scrollRef.current = node
      }
    },
    [scrollRef]
  )

  const resetPull = useCallback(() => {
    startRef.current = null
    pullingRef.current = false
    setPullDistance(0)
  }, [])

  const handleTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (disabled || refreshing || event.touches.length !== 1) {
        startRef.current = null
        pullingRef.current = false
        return
      }

      const scroller = localScrollRef.current

      if (!scroller || scroller.scrollTop > 0) {
        startRef.current = null
        pullingRef.current = false
        return
      }

      const touch = event.touches.item(0)

      if (!touch) {
        return
      }

      startRef.current = { x: touch.clientX, y: touch.clientY }
      pullingRef.current = false
    },
    [disabled, refreshing]
  )

  const handleTouchMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const start = startRef.current
      const scroller = localScrollRef.current

      if (!start || !scroller || disabled || refreshing || event.touches.length !== 1) {
        return
      }

      const touch = event.touches.item(0)

      if (!touch) {
        return
      }

      const deltaX = touch.clientX - start.x
      const deltaY = touch.clientY - start.y

      if (!pullingRef.current) {
        if (deltaY <= 0 || Math.abs(deltaX) > deltaY) {
          return
        }

        if (scroller.scrollTop > 0) {
          startRef.current = null
          return
        }

        pullingRef.current = true
      }

      if (event.cancelable) {
        event.preventDefault()
      }

      setPullDistance(Math.min(PULL_MAX_DISTANCE, deltaY * PULL_RESISTANCE))
    },
    [disabled, refreshing]
  )

  const handleTouchEnd = useCallback(() => {
    const shouldRefresh = pullingRef.current && pullDistance >= PULL_TRIGGER_DISTANCE

    startRef.current = null
    pullingRef.current = false

    if (!shouldRefresh || disabled || refreshing) {
      setPullDistance(0)
      return
    }

    setRefreshing(true)
    setPullDistance(42)

    void onRefresh().finally(() => {
      setRefreshing(false)
      setPullDistance(0)
    })
  }, [disabled, onRefresh, pullDistance, refreshing])

  const progress = Math.min(1, pullDistance / PULL_TRIGGER_DISTANCE)

  return (
    <div
      ref={setScrollElement}
      className={`ca-pull-refresh ca-scroll-section ${
        pullDistance > 0 && !refreshing ? 'pulling' : ''
      } ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={resetPull}
    >
      <div
        className={`ca-pull-refresh-indicator ${refreshing ? 'refreshing' : ''}`}
        style={{
          opacity: pullDistance > 0 || refreshing ? Math.max(0.35, progress) : 0,
          transform: `translate(-50%, ${Math.max(0, pullDistance - 36)}px) rotate(${progress * 180}deg)`,
        }}
      >
        <span />
      </div>
      <div
        className="ca-pull-refresh-content"
        style={{ transform: `translateY(${pullDistance}px)` }}
      >
        {children}
      </div>
    </div>
  )
}
