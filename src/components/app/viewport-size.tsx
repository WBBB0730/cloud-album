'use client'

import { useEffect } from 'react'

export function ViewportSize() {
  useEffect(() => {
    const root = document.documentElement

    const updateViewportSize = () => {
      const viewport = window.visualViewport
      const height = viewport?.height ?? window.innerHeight

      root.style.setProperty('--ca-viewport-height', `${height}px`)
    }

    updateViewportSize()
    window.addEventListener('resize', updateViewportSize)
    window.addEventListener('orientationchange', updateViewportSize)
    window.visualViewport?.addEventListener('resize', updateViewportSize)
    window.visualViewport?.addEventListener('scroll', updateViewportSize)

    return () => {
      window.removeEventListener('resize', updateViewportSize)
      window.removeEventListener('orientationchange', updateViewportSize)
      window.visualViewport?.removeEventListener('resize', updateViewportSize)
      window.visualViewport?.removeEventListener('scroll', updateViewportSize)
    }
  }, [])

  return null
}
