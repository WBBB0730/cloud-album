import {
  copyHeader,
  createBaseHeaders,
  fetchUpstream,
  hasMatchingValidator,
  loadMediaForRequest,
} from './media-route-utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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
  const headers = createBaseHeaders(item, 'original')
  const range = request.headers.get('range')

  headers.set('Accept-Ranges', 'bytes')

  if (!range && hasMatchingValidator(request, item, 'original')) {
    return new Response(null, { status: 304, headers })
  }

  const upstreamHeaders = new Headers()

  if (range) {
    upstreamHeaders.set('Range', range)
  }

  const upstream = await fetchUpstream(
    getSignedReadUrl(item.cosKey),
    request,
    upstreamHeaders
  ).catch(() => null)

  if (!upstream) {
    return new Response(null, { status: 504 })
  }

  if (!upstream.ok && upstream.status !== 304) {
    return new Response(null, { status: upstream.status })
  }

  copyHeader(headers, upstream.headers, 'Content-Length')
  copyHeader(headers, upstream.headers, 'Content-Range')
  copyHeader(headers, upstream.headers, 'Accept-Ranges', 'bytes')

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  })
}
