'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const CACHE_PREFIX = 'cloud-album:view:'
const CACHE_ENVELOPE_VERSION = 3

type CacheEnvelope<T> = {
  data: T
  dataVersion: string
  envelopeVersion: number
  savedAt: number
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
    record.envelopeVersion === CACHE_ENVELOPE_VERSION &&
    typeof record.dataVersion === 'string' &&
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

const readCache = <T>(
  key: string,
  dataVersion: string,
  validateCacheData?: (value: unknown) => value is T
) => {
  try {
    const cached = window.localStorage.getItem(key)

    if (!cached) {
      return null
    }

    const parsed = JSON.parse(cached) as unknown

    if (
      !isCacheEnvelope<T>(parsed) ||
      parsed.dataVersion !== dataVersion ||
      (validateCacheData && !validateCacheData(parsed.data))
    ) {
      window.localStorage.removeItem(key)
      return null
    }

    return parsed.data
  } catch {
    return null
  }
}

const writeCache = (key: string, dataVersion: string, value: unknown) => {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        data: value,
        dataVersion,
        envelopeVersion: CACHE_ENVELOPE_VERSION,
        savedAt: Date.now(),
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
  cacheVersion: string
  getCacheData?: (merged: T, fresh: T) => unknown
  mergeData?: (current: T | null, fresh: T) => T
  validateCacheData?: (value: unknown) => value is T
}

type MutateData<T> = T | ((current: T | null) => T | null)

export function useServerAction<T>(
  loader: () => Promise<T>,
  deps: unknown[],
  options: UseServerActionOptions<T>
) {
  const cacheKey = useMemo(() => getCacheKey(loader, deps), deps)
  const initialDataRef = useRef<T | null | undefined>(undefined)

  if (initialDataRef.current === undefined) {
    initialDataRef.current = readCache<T>(
      cacheKey,
      options.cacheVersion,
      options.validateCacheData
    )
  }

  const [data, setData] = useState<T | null>(
    () => initialDataRef.current ?? null
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(() => initialDataRef.current === null)
  const cacheKeyRef = useRef(cacheKey)
  const cacheVersionRef = useRef(options.cacheVersion)
  const dataRef = useRef<T | null>(data)
  const getCacheDataRef = useRef(options.getCacheData)
  const hasDataRef = useRef(data !== null)
  const loaderRef = useRef(loader)
  const mergeDataRef = useRef(options.mergeData)
  const mountedRef = useRef(false)
  const refreshKeyRef = useRef<string | null>(null)
  const validateCacheDataRef = useRef(options.validateCacheData)

  loaderRef.current = loader
  cacheVersionRef.current = options.cacheVersion
  getCacheDataRef.current = options.getCacheData
  mergeDataRef.current = options.mergeData
  validateCacheDataRef.current = options.validateCacheData

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
          const cacheValue =
            getCacheDataRef.current?.(nextValue, freshValue) ?? nextValue

          if (
            !validateCacheDataRef.current ||
            validateCacheDataRef.current(cacheValue)
          ) {
            writeCache(
              activeCacheKey,
              cacheVersionRef.current,
              cacheValue
            )
          } else {
            removeCache(activeCacheKey)
          }
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
      } else if (
        !validateCacheDataRef.current ||
        validateCacheDataRef.current(next)
      ) {
        writeCache(activeCacheKey, cacheVersionRef.current, next)
      } else {
        removeCache(activeCacheKey)
      }

      return next
    })

    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    const cached = readCache<T>(
      cacheKey,
      options.cacheVersion,
      options.validateCacheData
    )

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
