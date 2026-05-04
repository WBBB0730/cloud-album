"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"

import { isSignedUrlUsable } from "@/lib/signed-url"

type MediaThumbnailProps = {
  src: string
  alt: string
  type: "image" | "video"
  sizes: string
  className?: string
  priority?: boolean
  onError?: () => void
}

export function MediaThumbnail({
  src,
  alt,
  type,
  sizes,
  className = "object-cover",
  priority = false,
  onError,
}: MediaThumbnailProps) {
  const [failed, setFailed] = useState(false)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    setFailed(false)
  }, [src])

  useEffect(() => {
    if (!isSignedUrlUsable(src)) {
      setFailed(true)
      onErrorRef.current?.()
    }
  }, [src])

  const handleError = () => {
    setFailed(true)
    onErrorRef.current?.()
  }

  if (failed || !isSignedUrlUsable(src)) {
    return <span className="absolute inset-0 bg-[#eef0f2]" aria-label={alt} />
  }

  if (type === "video") {
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
}
