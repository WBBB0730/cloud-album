export const getMediaContentUrl = (
  mediaId: string,
  variant: 'original' | 'thumb' = 'original'
) => {
  const path = `/api/media/${encodeURIComponent(mediaId)}`

  return variant === 'thumb' ? `${path}/preview` : path
}
