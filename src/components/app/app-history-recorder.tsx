'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

import { recordFixedBackHistoryEntry } from '@/hooks/use-fixed-back-navigation'

export function AppHistoryRecorder() {
  const pathname = usePathname()

  useEffect(() => {
    recordFixedBackHistoryEntry()
  }, [pathname])

  return null
}
