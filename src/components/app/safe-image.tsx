'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

import { isSignedUrlUsable } from '@/lib/signed-url'

type SafeImageProps = {
  src: string
  alt: string
  sizes: string
  className?: string
}

export function SafeImage({
  src,
  alt,
  sizes,
  className = 'object-cover',
}: SafeImageProps) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (failed || !isSignedUrlUsable(src)) {
    return <span className="ca-media-placeholder" aria-label={alt} />
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      unoptimized
      className={className}
      sizes={sizes}
      onError={() => setFailed(true)}
    />
  )
}
