import {
  copyHeader,
  createBaseHeaders,
  fetchUpstream,
  hasMatchingValidator,
  loadMediaForRequest,
} from '../media-route-utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const IMAGE_PREVIEW_QUERY = {
  'imageMogr2/auto-orient/thumbnail/720x720>/format/webp/quality/80/ignore-error/1':
    '',
}

const VIDEO_PREVIEW_QUERY = {
  'ci-process': 'snapshot',
  time: 1,
  format: 'jpg',
  width: 720,
}

const getPreviewQuery = (mimeType: string) =>
  mimeType.startsWith('video/') ? VIDEO_PREVIEW_QUERY : IMAGE_PREVIEW_QUERY

const getPreviewContentType = (mimeType: string) =>
  mimeType.startsWith('video/') ? 'image/jpeg' : 'image/webp'

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ mediaId: string }>
  }
) {
  const { mediaId } = await params
  const loaded = await loadMediaForRequest(mediaId)

  if ('response' in loaded) {
    return loaded.response
  }

  const { getSignedReadUrl, item } = loaded
  const headers = createBaseHeaders(
    item,
    'preview',
    getPreviewContentType(item.mimeType)
  )

  if (hasMatchingValidator(request, item, 'preview')) {
    return new Response(null, { status: 304, headers })
  }

  const upstream = await fetchUpstream(
    getSignedReadUrl(item.cosKey, getPreviewQuery(item.mimeType)),
    request
  ).catch(() => null)

  if (!upstream) {
    return new Response(null, { status: 504 })
  }

  if (!upstream.ok && upstream.status !== 304) {
    return new Response(null, { status: upstream.status })
  }

  copyHeader(headers, upstream.headers, 'Content-Type')
  copyHeader(headers, upstream.headers, 'Content-Length')

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  })
}
