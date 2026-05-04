'use client'

import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

type LoadingOptions = {
  title?: string
  timeoutMs?: number
}

type LoadingEntry = {
  title: string
  timer: number | null
}

type GlobalLoadingContextValue = {
  showLoading: (options?: LoadingOptions) => () => void
  hideLoading: () => void
}

const GlobalLoadingContext = createContext<GlobalLoadingContextValue | null>(
  null
)

const DEFAULT_TITLE = '加载中'
const DEFAULT_TIMEOUT_MS = 15000

function NavigationReset({ onChange }: { onChange: () => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    onChange()
  }, [onChange, pathname, searchParams])

  return null
}

export function GlobalLoadingProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Map<number, LoadingEntry>>(
    () => new Map()
  )
  const nextIdRef = useRef(1)

  const hideById = useCallback((id: number) => {
    setEntries((current) => {
      const entry = current.get(id)
      if (!entry) {
        return current
      }

      if (entry.timer) {
        window.clearTimeout(entry.timer)
      }

      const next = new Map(current)
      next.delete(id)
      return next
    })
  }, [])

  const hideLoading = useCallback(() => {
    setEntries((current) => {
      current.forEach((entry) => {
        if (entry.timer) {
          window.clearTimeout(entry.timer)
        }
      })
      return new Map()
    })
  }, [])

  const showLoading = useCallback(
    (options: LoadingOptions = {}) => {
      const id = nextIdRef.current++
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
      let closed = false

      const close = () => {
        if (closed) {
          return
        }
        closed = true
        hideById(id)
      }

      const timer =
        timeoutMs > 0
          ? window.setTimeout(() => {
              close()
            }, timeoutMs)
          : null

      setEntries((current) => {
        const next = new Map(current)
        next.set(id, {
          title: options.title ?? DEFAULT_TITLE,
          timer,
        })
        return next
      })

      return close
    },
    [hideById]
  )

  useEffect(() => {
    const handleSubmit = (event: SubmitEvent) => {
      const form = event.target

      if (!(form instanceof HTMLFormElement)) {
        return
      }

      showLoading({ title: '处理中' })
    }

    document.addEventListener('submit', handleSubmit, true)

    return () => {
      document.removeEventListener('submit', handleSubmit, true)
    }
  }, [showLoading])

  useEffect(() => {
    return () => {
      hideLoading()
    }
  }, [hideLoading])

  const value = useMemo(
    () => ({
      showLoading,
      hideLoading,
    }),
    [hideLoading, showLoading]
  )

  const latestEntry = Array.from(entries.values()).at(-1)

  return (
    <GlobalLoadingContext.Provider value={value}>
      <Suspense fallback={null}>
        <NavigationReset onChange={hideLoading} />
      </Suspense>
      {children}
      {latestEntry ? (
        <div
          className="ca-global-loading"
          role="status"
          aria-live="polite"
          aria-label={latestEntry.title}
        >
          <div className="ca-global-loading-panel">
            <span className="ca-global-loading-spinner" aria-hidden="true" />
            <span>{latestEntry.title}</span>
          </div>
        </div>
      ) : null}
    </GlobalLoadingContext.Provider>
  )
}

export function useGlobalLoading() {
  const context = useContext(GlobalLoadingContext)

  if (!context) {
    throw new Error(
      'useGlobalLoading must be used within GlobalLoadingProvider'
    )
  }

  return context
}
