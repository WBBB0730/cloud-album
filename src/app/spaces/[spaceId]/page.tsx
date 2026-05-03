"use client"

import { Suspense } from "react"
import { useParams, useSearchParams } from "next/navigation"

import { LoadingState } from "@/components/app/loading-state"
import { MobileFrame } from "@/components/app/mobile-frame"

import { SpaceClient } from "./space-client"

function SpacePageContent() {
  const params = useParams<{ spaceId: string }>()
  const searchParams = useSearchParams()
  const view = searchParams.get("view") === "list" ? "list" : "grid"

  return <SpaceClient spaceId={params.spaceId} view={view} />
}

export default function SpacePage() {
  return (
    <Suspense fallback={<MobileFrame><LoadingState /></MobileFrame>}>
        <SpacePageContent />
      </Suspense>
  )
}
