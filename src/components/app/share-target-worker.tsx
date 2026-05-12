'use client'

import { useEffect } from 'react'

export function ShareTargetWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return
    }

    navigator.serviceWorker.register('/share-target-sw.js').catch(() => {
      // 分享入口不可用不影响普通网页上传。
    })
  }, [])

  return null
}
