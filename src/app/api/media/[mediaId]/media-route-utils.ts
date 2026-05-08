const BROWSER_CACHE_CONTROL = 'private, no-cache'
const UPSTREAM_TIMEOUT_MS = 15_000

export type MediaContent = {
  id: string
  size: number
  mimeType: string
  cosKey: string
  updatedAt: Date | string
}

export const getMediaEtag = (item: MediaContent, variant: string) => {
  const updatedAt = new Date(item.updatedAt).getTime()

  return `"media-${item.id}-${variant}-${item.size}-${updatedAt}"`
}

export const getLastModified = (item: MediaContent) =>
  new Date(item.updatedAt).toUTCString()

export const createBaseHeaders = (
  item: MediaContent,
  variant: string,
  contentType = item.mimeType
) => {
  const headers = new Headers()

  headers.set('Cache-Control', BROWSER_CACHE_CONTROL)
  headers.set('Content-Type', contentType)
  headers.set('ETag', getMediaEtag(item, variant))
  headers.set('Last-Modified', getLastModified(item))

  return headers
}

export const hasMatchingValidator = (
  request: Request,
  item: MediaContent,
  variant: string
) => {
  const etag = getMediaEtag(item, variant)
  const ifNoneMatch = request.headers.get('if-none-match')

  if (
    ifNoneMatch
      ?.split(',')
      .map((value) => value.trim())
      .includes(etag)
  ) {
    return true
  }

  const ifModifiedSince = request.headers.get('if-modified-since')

  if (!ifModifiedSince) {
    return false
  }

  const requestTime = new Date(ifModifiedSince).getTime()
  const updatedTime = new Date(item.updatedAt).getTime()

  return Number.isFinite(requestTime) && updatedTime <= requestTime
}

export const copyHeader = (
  target: Headers,
  source: Headers,
  name: string,
  fallback?: string
) => {
  const value = source.get(name) ?? fallback

  if (value) {
    target.set(name, value)
  }
}

export const fetchUpstream = async (
  url: string,
  request: Request,
  headers = new Headers()
) => {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timeout = setTimeout(abort, UPSTREAM_TIMEOUT_MS)

  request.signal.addEventListener('abort', abort, { once: true })

  try {
    return await fetch(url, {
      cache: 'no-store',
      headers,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
    request.signal.removeEventListener('abort', abort)
  }
}

export const loadMediaForRequest = async (
  mediaId: string
): Promise<
  | {
      item: MediaContent
      getSignedReadUrl: typeof import('@/lib/cos').getSignedReadUrl
    }
  | { response: Response }
> => {
  const [{ getCurrentUser }, { getMediaContent }, { getSignedReadUrl }] =
    await Promise.all([
      import('@/features/auth/session'),
      import('@/features/albums/service'),
      import('@/lib/cos'),
    ])
  const user = await getCurrentUser()

  if (!user) {
    return { response: new Response(null, { status: 401 }) }
  }

  try {
    const item = await getMediaContent(mediaId, user.id)

    return { item, getSignedReadUrl }
  } catch (error) {
    const message = error instanceof Error ? error.message : '媒体读取失败'
    const status = message === '无权访问该空间' ? 403 : 404

    return { response: new Response(null, { status }) }
  }
}
