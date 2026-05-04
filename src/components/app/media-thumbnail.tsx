'use client'

import Image from 'next/image'
import { memo, useEffect, useRef, useState } from 'react'

import { isSignedUrlUsable } from '@/lib/signed-url'

type MediaThumbnailProps = {
  src: string
  alt: string
  type: 'image' | 'video'
  sizes: string
  className?: string
  priority?: boolean
  onError?: () => void
  lazyRootMargin?: string
}

const DEFAULT_LAZY_ROOT_MARGIN = '420px'

export const MediaThumbnail = memo(function MediaThumbnail({
  src,
  alt,
  type,
  sizes,
  className = 'object-cover',
  priority = false,
  onError,
  lazyRootMargin = DEFAULT_LAZY_ROOT_MARGIN,
}: MediaThumbnailProps) {
  const [failed, setFailed] = useState(false)
  const [shouldLoad, setShouldLoad] = useState(priority)
  const lazyRef = useRef<HTMLSpanElement | null>(null)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    setFailed(false)
  }, [src])

  useEffect(() => {
    if (priority) {
      setShouldLoad(true)
    }
  }, [priority])

  useEffect(() => {
    if (shouldLoad || priority) {
      return
    }

    const element = lazyRef.current

    if (!element) {
      return
    }

    if (!('IntersectionObserver' in window)) {
      setShouldLoad(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) {
          return
        }

        setShouldLoad(true)
        observer.disconnect()
      },
      {
        rootMargin: lazyRootMargin,
      }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [lazyRootMargin, priority, shouldLoad])

  useEffect(() => {
    if (shouldLoad && !isSignedUrlUsable(src)) {
      setFailed(true)
      onErrorRef.current?.()
    }
  }, [shouldLoad, src])

  const handleError = () => {
    setFailed(true)
    onErrorRef.current?.()
  }

  if (!shouldLoad) {
    return (
      <span
        ref={lazyRef}
        className="absolute inset-0 bg-[#eef0f2]"
        aria-label={alt}
      />
    )
  }

  if (failed || !isSignedUrlUsable(src)) {
    return <span className="absolute inset-0 bg-[#eef0f2]" aria-label={alt} />
  }

  if (type === 'video') {
    return (
      <video
        src={`${src}#t=0.1`}
        aria-label={alt}
        className={`h-full w-full ${className}`}
        muted
        playsInline
        preload="metadata"
        draggable={false}
        onContextMenu={(event) => event.preventDefault()}
        onError={handleError}
      />
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      className={className}
      sizes={sizes}
      priority={priority}
      draggable={false}
      onContextMenu={(event) => event.preventDefault()}
      onError={handleError}
    />
  )
})
