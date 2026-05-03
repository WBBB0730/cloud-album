"use client"

import { Suspense } from "react"
import { useParams, useSearchParams } from "next/navigation"

import { LoadingState } from "@/components/app/loading-state"
import { MobileFrame } from "@/components/app/mobile-frame"

import { NewFolderClient } from "./new-folder-client"

function NewFolderPageContent() {
  const params = useParams<{ spaceId: string }>()
  const searchParams = useSearchParams()

  return <NewFolderClient spaceId={params.spaceId} error={searchParams.get("error") ?? undefined} />
}

export default function NewFolderPage() {
  return (
    <Suspense fallback={<MobileFrame><LoadingState /></MobileFrame>}>
        <NewFolderPageContent />
      </Suspense>
  )
}
