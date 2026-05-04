"use client"

import { Suspense } from "react"
import { useParams, useSearchParams } from "next/navigation"

import { LoadingState } from "@/components/app/loading-state"
import { MobileFrame } from "@/components/app/mobile-frame"

import { MembersClient } from "./members-client"

function MembersPageContent() {
  const params = useParams<{ spaceId: string }>()
  const searchParams = useSearchParams()
  const error = searchParams.get("error") ?? undefined

  return <MembersClient spaceId={params.spaceId} error={error} />
}

export default function MembersPage() {
  return (
    <Suspense fallback={<MobileFrame><LoadingState /></MobileFrame>}>
      <MembersPageContent />
    </Suspense>
  )
}
