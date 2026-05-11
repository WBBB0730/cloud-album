'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const CACHE_PREFIX = 'cloud-album:view:'
const CACHE_SCHEMA_VERSION = 2

type CacheEnvelope<T> = {
  data: T
  savedAt: number
  version: number
}

let cacheCleanupDone = false

const getCacheKey = (loader: () => Promise<unknown>, deps: unknown[]) => {
  let serializedDeps = ''

  try {
    serializedDeps = JSON.stringify(deps)
  } catch {
    serializedDeps = String(deps)
  }

  return `${CACHE_PREFIX}${loader.toString()}:${serializedDeps}`
}

const isCacheEnvelope = <T>(value: unknown): value is CacheEnvelope<T> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const record = value as Partial<CacheEnvelope<T>>

  return (
    record.version === CACHE_SCHEMA_VERSION &&
    typeof record.savedAt === 'number' &&
    'data' in record
  )
}

const cleanupLegacyCache = () => {
  if (cacheCleanupDone) {
    return
  }

  cacheCleanupDone = true

  try {
    const keys = Array.from(
      { length: window.localStorage.length },
      (_, index) => window.localStorage.key(index)
    ).filter((key): key is string => Boolean(key?.startsWith(CACHE_PREFIX)))

    for (const key of keys) {
      const cached = window.localStorage.getItem(key)

      if (!cached) {
        continue
      }

      try {
        const parsed = JSON.parse(cached) as unknown

        if (!isCacheEnvelope(parsed)) {
          window.localStorage.removeItem(key)
        }
      } catch {
        window.localStorage.removeItem(key)
      }
    }
  } catch {
    // localStorage can be unavailable; fresh data will be loaded as usual.
  }
}

const readCache = <T>(key: string) => {
  try {
    const cached = window.localStorage.getItem(key)

    if (!cached) {
      return null
    }

    const parsed = JSON.parse(cached) as unknown

    if (!isCacheEnvelope<T>(parsed)) {
      return null
    }

    return parsed.data
  } catch {
    return null
  }
}

const writeCache = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        data: value,
        savedAt: Date.now(),
        version: CACHE_SCHEMA_VERSION,
      })
    )
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

export const clearServerActionCache = () => {
  try {
    const keys = Array.from(
      { length: window.localStorage.length },
      (_, index) => window.localStorage.key(index)
    ).filter((key): key is string => Boolean(key?.startsWith(CACHE_PREFIX)))

    for (const key of keys) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // localStorage can be unavailable; fresh data will be loaded on next page.
  }
}

type RefreshOptions = {
  showLoading?: boolean
}

type UseServerActionOptions<T> = {
  getCacheData?: (merged: T, fresh: T) => unknown
  mergeData?: (current: T | null, fresh: T) => T
}

type MutateData<T> = T | ((current: T | null) => T | null)

export function useServerAction<T>(
  loader: () => Promise<T>,
  deps: unknown[],
  options: UseServerActionOptions<T> = {}
) {
  const cacheKey = useMemo(() => getCacheKey(loader, deps), deps)
  const initialDataRef = useRef<T | null | undefined>(undefined)

  if (initialDataRef.current === undefined) {
    initialDataRef.current = readCache<T>(cacheKey)
  }

  const [data, setData] = useState<T | null>(
    () => initialDataRef.current ?? null
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(() => initialDataRef.current === null)
  const cacheKeyRef = useRef(cacheKey)
  const dataRef = useRef<T | null>(data)
  const getCacheDataRef = useRef(options.getCacheData)
  const hasDataRef = useRef(data !== null)
  const loaderRef = useRef(loader)
  const mergeDataRef = useRef(options.mergeData)
  const mountedRef = useRef(false)
  const refreshKeyRef = useRef<string | null>(null)

  loaderRef.current = loader
  getCacheDataRef.current = options.getCacheData
  mergeDataRef.current = options.mergeData

  useEffect(() => {
    cleanupLegacyCache()
  }, [])

  const updateData = (value: T) => {
    dataRef.current = value
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

  const refresh = useCallback(
    async (options: RefreshOptions = {}) => {
      const activeCacheKey = cacheKey

      if (refreshKeyRef.current === activeCacheKey) {
        return null
      }

      refreshKeyRef.current = activeCacheKey

      if (options.showLoading) {
        setLoading(true)
      }

      try {
        const freshValue = await loaderRef.current()

        if (mountedRef.current && cacheKeyRef.current === activeCacheKey) {
          const nextValue =
            mergeDataRef.current?.(dataRef.current, freshValue) ?? freshValue

          updateData(nextValue)
          setError(null)
          writeCache(
            activeCacheKey,
            getCacheDataRef.current?.(nextValue, freshValue) ?? nextValue
          )
          return nextValue
        }

        return freshValue
      } catch (reason) {
        if (
          mountedRef.current &&
          cacheKeyRef.current === activeCacheKey &&
          !hasDataRef.current
        ) {
          setError(reason instanceof Error ? reason.message : '加载失败')
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
    },
    [cacheKey]
  )

  const mutate = useCallback((nextData: MutateData<T>) => {
    const activeCacheKey = cacheKeyRef.current

    setData((current) => {
      const next =
        typeof nextData === 'function'
          ? (nextData as (current: T | null) => T | null)(current)
          : nextData

      dataRef.current = next
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
      dataRef.current = null
      hasDataRef.current = false
      setLoading(true)
    }

    setError(null)
    void refresh({ showLoading: cached === null })
  }, [cacheKey, refresh])

  return { data, error, loading, refresh, mutate }
}
