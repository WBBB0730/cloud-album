"use client"

import { useSearchParams } from "next/navigation"

import { useFixedBackNavigation } from "@/hooks/use-fixed-back-navigation"

import { MembersClient } from "./members-client"

export function MembersPageClient({ spaceId }: { spaceId: string }) {
  const searchParams = useSearchParams()
  const error = searchParams.get("error") ?? undefined

  useFixedBackNavigation(`/spaces/${spaceId}`)

  return <MembersClient spaceId={spaceId} error={error} />
}
