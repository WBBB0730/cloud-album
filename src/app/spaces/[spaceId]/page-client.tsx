"use client"

import { useSearchParams } from "next/navigation"

import { useFixedBackNavigation } from "@/hooks/use-fixed-back-navigation"

import { SpaceClient } from "./space-client"

export function SpacePageClient({ spaceId }: { spaceId: string }) {
  const searchParams = useSearchParams()
  const view = searchParams.get("view") === "list" ? "list" : "grid"

  useFixedBackNavigation("/spaces")

  return <SpaceClient spaceId={spaceId} view={view} />
}
