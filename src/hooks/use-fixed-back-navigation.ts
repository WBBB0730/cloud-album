"use client"

import { useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

type BackSource = "button" | "history"

type UseFixedBackNavigationOptions = {
  enabled?: boolean
  blocking?: boolean
  onBlockedBack?: (source: BackSource) => void
}

const FIXED_BACK_STATE_KEY = "__cloudAlbumFixedBack"

export const useFixedBackNavigation = (
  targetHref: string,
  {
    enabled = true,
    blocking = false,
    onBlockedBack,
  }: UseFixedBackNavigationOptions = {}
) => {
  const router = useRouter()
  const enabledRef = useRef(enabled)
  const blockingRef = useRef(blocking)
  const targetHrefRef = useRef(targetHref)
  const onBlockedBackRef = useRef(onBlockedBack)
  const guardActiveRef = useRef(false)
  const leavingRef = useRef(false)

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
    if (!enabledRef.current || guardActiveRef.current) {
      return
    }

    window.history.pushState(
      {
        ...(window.history.state ?? {}),
        [FIXED_BACK_STATE_KEY]: true,
      },
      "",
      window.location.href
    )
    guardActiveRef.current = true
  }, [])

  const leaveToTarget = useCallback(() => {
    leavingRef.current = true
    guardActiveRef.current = false
    router.replace(targetHrefRef.current)
  }, [router])

  const requestBack = useCallback((source: BackSource = "button") => {
    if (!enabledRef.current) {
      leaveToTarget()
      return
    }

    if (blockingRef.current) {
      onBlockedBackRef.current?.(source)
      return
    }

    leaveToTarget()
  }, [leaveToTarget])

  useEffect(() => {
    if (!enabled) {
      return
    }

    pushGuard()
  }, [enabled, pushGuard])

  useEffect(() => {
    const handlePopState = () => {
      if (!enabledRef.current) {
        return
      }

      if (leavingRef.current) {
        leavingRef.current = false
        guardActiveRef.current = false
        return
      }

      guardActiveRef.current = false

      if (blockingRef.current) {
        pushGuard()
        onBlockedBackRef.current?.("history")
        return
      }

      leaveToTarget()
    }

    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("popstate", handlePopState)
    }
  }, [leaveToTarget, pushGuard])

  return {
    leaveToTarget,
    requestBack,
  }
}
