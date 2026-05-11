'use client'

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

type BackSource = 'button' | 'history'

type UseFixedBackNavigationOptions = {
  enabled?: boolean
  blocking?: boolean
  onBlockedBack?: (source: BackSource) => void
}

type HistoryStackEntry = {
  fixed: boolean
  href: string
  index: number
  ownerId?: string
  targetHref?: string
}

const FIXED_BACK_STATE_KEY = '__cloudAlbumFixedBack'
const FIXED_BACK_HREF_KEY = '__cloudAlbumFixedBackHref'
const FIXED_BACK_OWNER_KEY = '__cloudAlbumFixedBackOwner'
const FIXED_BACK_TARGET_KEY = '__cloudAlbumFixedBackTarget'
const HISTORY_INDEX_KEY = '__cloudAlbumHistoryIndex'

let currentHistoryIndex: number | null = null
let historyStack: HistoryStackEntry[] = []

const getStateHistoryIndex = (state: unknown) => {
  if (!state || typeof state !== 'object') {
    return null
  }

  const value = (state as Record<string, unknown>)[HISTORY_INDEX_KEY]
  return typeof value === 'number' ? value : null
}

const getTargetUrl = (targetHref: string) => {
  return new URL(targetHref, window.location.origin).href
}

const getLocalHref = (href: string) => {
  const url = new URL(href, window.location.origin)
  return `${url.pathname}${url.search}${url.hash}`
}

const omitFixedBackState = (state: Record<string, unknown>) => {
  const {
    [FIXED_BACK_STATE_KEY]: _fixed,
    [FIXED_BACK_HREF_KEY]: _href,
    [FIXED_BACK_OWNER_KEY]: _owner,
    [FIXED_BACK_TARGET_KEY]: _target,
    ...restState
  } = state

  return restState
}

const isCurrentFixedBackState = (
  state: Record<string, unknown>,
  href: string,
  ownerId: string,
  targetHref: string
) => {
  return (
    state[FIXED_BACK_STATE_KEY] === true &&
    state[FIXED_BACK_HREF_KEY] === href &&
    state[FIXED_BACK_OWNER_KEY] === ownerId &&
    state[FIXED_BACK_TARGET_KEY] === targetHref
  )
}

const recordCurrentHistoryEntry = (ownerId?: string) => {
  const rawState = window.history.state ?? {}
  const currentHref = window.location.href
  const currentStateIndex = getStateHistoryIndex(rawState)
  const previousEntry =
    currentStateIndex === null
      ? null
      : historyStack.find((entry) => entry.index === currentStateIndex)
  const shouldKeepStateIndex =
    currentStateIndex !== null &&
    (currentStateIndex !== currentHistoryIndex ||
      previousEntry?.href === currentHref)
  const index =
    shouldKeepStateIndex && currentStateIndex !== null
      ? currentStateIndex
      : currentHistoryIndex === null
        ? 0
        : currentHistoryIndex + 1
  const fixed =
    rawState[FIXED_BACK_STATE_KEY] === true &&
    rawState[FIXED_BACK_HREF_KEY] === currentHref &&
    (ownerId === undefined || rawState[FIXED_BACK_OWNER_KEY] === ownerId)
  const state = fixed ? rawState : omitFixedBackState(rawState)
  const nextState =
    getStateHistoryIndex(state) === index
      ? state
      : { ...state, [HISTORY_INDEX_KEY]: index }

  if (nextState !== rawState) {
    window.history.replaceState(nextState, '', currentHref)
  }

  historyStack = historyStack
    .filter((entry) => entry.index < index)
    .concat({
      fixed,
      href: currentHref,
      index,
      ownerId: fixed ? (nextState[FIXED_BACK_OWNER_KEY] as string) : undefined,
      targetHref: fixed
        ? (nextState[FIXED_BACK_TARGET_KEY] as string | undefined)
        : undefined,
    })
  currentHistoryIndex = index

  return index
}

export const recordFixedBackHistoryEntry = () => {
  recordCurrentHistoryEntry()
}

const pushFixedHistoryEntry = (ownerId: string, targetHref: string) => {
  const href = window.location.href
  const targetUrl = getTargetUrl(targetHref)

  if (href === targetUrl) {
    return null
  }

  const currentState = window.history.state ?? {}

  if (isCurrentFixedBackState(currentState, href, ownerId, targetUrl)) {
    const currentIndex = getStateHistoryIndex(currentState)

    if (currentIndex !== null) {
      currentHistoryIndex = currentIndex
    }

    return href
  }

  const currentIndex = recordCurrentHistoryEntry(ownerId)
  const fixedIndex = currentIndex + 1
  const fixedState = {
    ...omitFixedBackState(window.history.state ?? {}),
    [FIXED_BACK_STATE_KEY]: true,
    [FIXED_BACK_HREF_KEY]: href,
    [FIXED_BACK_OWNER_KEY]: ownerId,
    [FIXED_BACK_TARGET_KEY]: targetUrl,
    [HISTORY_INDEX_KEY]: fixedIndex,
  }

  window.history.pushState(fixedState, '', href)

  historyStack = historyStack
    .filter((entry) => entry.index < fixedIndex)
    .concat({
      fixed: true,
      href,
      index: fixedIndex,
      ownerId,
      targetHref: targetUrl,
    })
  currentHistoryIndex = fixedIndex

  return href
}

const normalizePoppedHistoryState = (state: unknown, ownerId: string) => {
  const currentIndex = getStateHistoryIndex(state)

  if (
    currentIndex === null ||
    !state ||
    typeof state !== 'object' ||
    (state as Record<string, unknown>)[FIXED_BACK_STATE_KEY] !== true ||
    (state as Record<string, unknown>)[FIXED_BACK_HREF_KEY] !==
      window.location.href ||
    (state as Record<string, unknown>)[FIXED_BACK_OWNER_KEY] !== ownerId
  ) {
    currentHistoryIndex = currentIndex
    return currentIndex
  }

  const restoredEntry = historyStack
    .filter(
      (entry) =>
        !entry.fixed &&
        entry.href === window.location.href &&
        entry.index < currentIndex
    )
    .sort((a, b) => b.index - a.index)[0]

  if (!restoredEntry) {
    currentHistoryIndex = currentIndex
    return currentIndex
  }

  window.history.replaceState(
    {
      ...omitFixedBackState(window.history.state ?? {}),
      [HISTORY_INDEX_KEY]: restoredEntry.index,
    },
    '',
    window.location.href
  )
  currentHistoryIndex = restoredEntry.index

  return restoredEntry.index
}

const findHistoryTarget = (targetUrl: string, currentIndex: number | null) => {
  if (currentIndex === null) {
    return null
  }

  const targetEntry = historyStack
    .filter((entry) => entry.href === targetUrl && entry.index < currentIndex)
    .sort((a, b) => b.index - a.index)[0]

  if (!targetEntry) {
    return null
  }

  return targetEntry
}

const leaveToFixedBackTarget = (
  targetHref: string,
  replace: (href: string) => void,
  currentIndex?: number | null
) => {
  const targetUrl = getTargetUrl(targetHref)
  const knownCurrentIndex =
    currentIndex ?? getStateHistoryIndex(window.history.state)
  const targetEntry = findHistoryTarget(targetUrl, knownCurrentIndex)

  if (targetEntry && knownCurrentIndex !== null) {
    window.history.go(targetEntry.index - knownCurrentIndex)
    return
  }

  replace(targetHref)
}

export const useFixedBackNavigation = (
  targetHref: string,
  {
    enabled = true,
    blocking = false,
    onBlockedBack,
  }: UseFixedBackNavigationOptions = {}
) => {
  const router = useRouter()
  const pathname = usePathname()
  const enabledRef = useRef(enabled)
  const blockingRef = useRef(blocking)
  const guardHrefRef = useRef<string | null>(null)
  const targetHrefRef = useRef(targetHref)
  const onBlockedBackRef = useRef(onBlockedBack)
  const restoringBlockedBackRef = useRef(false)
  const restoringBlockedBackTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  useEffect(() => {
    blockingRef.current = blocking
  }, [blocking])

  useEffect(() => {
    targetHrefRef.current = targetHref
  }, [targetHref])

  useEffect(() => {
    onBlockedBackRef.current = onBlockedBack
  }, [onBlockedBack])

  const pushGuard = useCallback(() => {
    if (!enabledRef.current) {
      return
    }

    const ownerId = getTargetUrl(targetHrefRef.current)

    guardHrefRef.current = pushFixedHistoryEntry(ownerId, targetHrefRef.current)
  }, [])

  const restoreBlockedGuard = useCallback(() => {
    restoringBlockedBackRef.current = true

    if (restoringBlockedBackTimeoutRef.current !== null) {
      window.clearTimeout(restoringBlockedBackTimeoutRef.current)
    }

    restoringBlockedBackTimeoutRef.current = window.setTimeout(() => {
      restoringBlockedBackRef.current = false
      restoringBlockedBackTimeoutRef.current = null
    }, 1000)

    window.history.forward()
  }, [])

  const leaveToTarget = useCallback(
    (currentIndex?: number | null) => {
      guardHrefRef.current = null
      leaveToFixedBackTarget(
        targetHrefRef.current,
        (href) => router.replace(getLocalHref(href)),
        currentIndex
      )
    },
    [router]
  )

  const requestBack = useCallback(
    (source: BackSource = 'button') => {
      if (!enabledRef.current) {
        leaveToTarget()
        return
      }

      if (blockingRef.current) {
        onBlockedBackRef.current?.(source)
        return
      }

      leaveToTarget()
    },
    [leaveToTarget]
  )

  useLayoutEffect(() => {
    let animationFrame = 0
    let timeout = 0

    if (!enabled) {
      guardHrefRef.current = null
      return
    }

    pushGuard()
    window.queueMicrotask(pushGuard)
    animationFrame = window.requestAnimationFrame(pushGuard)
    timeout = window.setTimeout(pushGuard, 50)

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame)
      }
      if (timeout) {
        window.clearTimeout(timeout)
      }
    }
  }, [enabled, pathname, pushGuard, targetHref])

  useEffect(() => {
    return () => {
      if (restoringBlockedBackTimeoutRef.current !== null) {
        window.clearTimeout(restoringBlockedBackTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (!enabledRef.current) {
        return
      }

      const ownerId = getTargetUrl(targetHrefRef.current)
      const guardedHref = guardHrefRef.current

      if (!guardedHref || window.location.href !== guardedHref) {
        return
      }

      event.stopImmediatePropagation()

      if (restoringBlockedBackRef.current) {
        restoringBlockedBackRef.current = false

        if (restoringBlockedBackTimeoutRef.current !== null) {
          window.clearTimeout(restoringBlockedBackTimeoutRef.current)
          restoringBlockedBackTimeoutRef.current = null
        }

        const restoredIndex = getStateHistoryIndex(event.state)

        if (restoredIndex !== null) {
          currentHistoryIndex = restoredIndex
        }

        return
      }

      const currentIndex = normalizePoppedHistoryState(event.state, ownerId)

      if (blockingRef.current) {
        restoreBlockedGuard()
        onBlockedBackRef.current?.('history')
        return
      }

      leaveToTarget(currentIndex)
    }

    window.addEventListener('popstate', handlePopState, true)

    return () => {
      window.removeEventListener('popstate', handlePopState, true)
    }
  }, [leaveToTarget, restoreBlockedGuard])

  return {
    leaveToTarget,
    requestBack,
  }
}
