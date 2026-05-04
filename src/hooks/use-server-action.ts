"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

const CACHE_PREFIX = "cloud-album:view:"

const getCacheKey = (loader: () => Promise<unknown>, deps: unknown[]) => {
  let serializedDeps = ""

  try {
    serializedDeps = JSON.stringify(deps)
  } catch {
    serializedDeps = String(deps)
  }

  return `${CACHE_PREFIX}${loader.toString()}:${serializedDeps}`
}

const readCache = <T,>(key: string) => {
  try {
    const cached = window.localStorage.getItem(key)
    return cached ? (JSON.parse(cached) as T) : null
  } catch {
    return null
  }
}

const writeCache = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage can be unavailable or full; fresh data should still render.
  }
}

const removeCache = (key: string) => {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // localStorage can be unavailable; in-memory state still updates.
  }
}

type RefreshOptions = {
  showLoading?: boolean
}

type MutateData<T> = T | ((current: T | null) => T | null)

export function useServerAction<T>(loader: () => Promise<T>, deps: unknown[]) {
  const cacheKey = useMemo(() => getCacheKey(loader, deps), deps)
  const [data, setData] = useState<T | null>(() => readCache<T>(cacheKey))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(() => readCache<T>(cacheKey) === null)
  const cacheKeyRef = useRef(cacheKey)
  const hasDataRef = useRef(data !== null)
  const loaderRef = useRef(loader)
  const mountedRef = useRef(false)
  const refreshKeyRef = useRef<string | null>(null)

  loaderRef.current = loader

  const updateData = (value: T) => {
    hasDataRef.current = true
    setData(value)
  }

  useEffect(() => {
    cacheKeyRef.current = cacheKey
  }, [cacheKey])

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async (options: RefreshOptions = {}) => {
    const activeCacheKey = cacheKey

    if (refreshKeyRef.current === activeCacheKey) {
      return null
    }

    refreshKeyRef.current = activeCacheKey

    if (options.showLoading) {
      setLoading(true)
    }

    try {
      const value = await loaderRef.current()

      if (mountedRef.current && cacheKeyRef.current === activeCacheKey) {
        updateData(value)
        setError(null)
        writeCache(activeCacheKey, value)
      }

      return value
    } catch (reason) {
      if (mountedRef.current && cacheKeyRef.current === activeCacheKey && !hasDataRef.current) {
        setError(reason instanceof Error ? reason.message : "加载失败")
      }

      return null
    } finally {
      if (refreshKeyRef.current === activeCacheKey) {
        refreshKeyRef.current = null
      }

      if (mountedRef.current && cacheKeyRef.current === activeCacheKey) {
        setLoading(false)
      }
    }
  }, [cacheKey])

  const mutate = useCallback((nextData: MutateData<T>) => {
    const activeCacheKey = cacheKeyRef.current

    setData((current) => {
      const next = typeof nextData === "function"
        ? (nextData as (current: T | null) => T | null)(current)
        : nextData

      hasDataRef.current = next !== null

      if (next === null) {
        removeCache(activeCacheKey)
      } else {
        writeCache(activeCacheKey, next)
      }

      return next
    })

    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    const cached = readCache<T>(cacheKey)

    if (cached) {
      updateData(cached)
      setLoading(false)
    } else {
      hasDataRef.current = false
      setLoading(true)
    }

    setError(null)
    void refresh({ showLoading: cached === null })
  }, [cacheKey, refresh])

  return { data, error, loading, refresh, mutate }
}
