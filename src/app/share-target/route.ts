import { NextResponse } from 'next/server'

const redirectToWorkerError = (request: Request) => {
  const url = new URL('/share/import', request.url)
  url.searchParams.set('error', 'worker')

  return NextResponse.redirect(url, 303)
}

export const GET = redirectToWorkerError
export const POST = redirectToWorkerError
