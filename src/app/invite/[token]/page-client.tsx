"use client"

import { useSearchParams } from "next/navigation"

import { InviteClient } from "./invite-client"

export function InvitePageClient({ token }: { token: string }) {
  const searchParams = useSearchParams()

  return <InviteClient token={token} error={searchParams.get("error") ?? undefined} />
}
