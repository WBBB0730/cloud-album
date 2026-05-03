"use client"

import { Suspense } from "react"
import { useParams, useSearchParams } from "next/navigation"

import { LoadingState } from "@/components/app/loading-state"
import { MobileFrame } from "@/components/app/mobile-frame"

import { InviteClient } from "./invite-client"

function InvitePageContent() {
  const params = useParams<{ token: string }>()
  const searchParams = useSearchParams()

  return <InviteClient token={params.token} error={searchParams.get("error") ?? undefined} />
}

export default function InvitePage() {
  return (
    <Suspense fallback={<MobileFrame variant="auth"><LoadingState /></MobileFrame>}>
        <InvitePageContent />
      </Suspense>
  )
}
