export const SIGNED_URL_REFRESH_WINDOW_MS = 60_000

export const getSignedUrlExpiresAt = (url: string) => {
  try {
    const value = new URL(url).searchParams.get('q-sign-time')
    const [, end] = value?.split(';') ?? []
    const expiresAt = Number(end)

    return Number.isFinite(expiresAt) ? expiresAt * 1000 : null
  } catch {
    return null
  }
}

export const isSignedUrlUsable = (url: string, now = Date.now()) => {
  const expiresAt = getSignedUrlExpiresAt(url)

  return expiresAt === null || expiresAt > now + SIGNED_URL_REFRESH_WINDOW_MS
}
