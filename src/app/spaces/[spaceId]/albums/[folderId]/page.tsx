"use client"

import { Suspense } from "react"
import { useParams, useSearchParams } from "next/navigation"

import { LoadingState } from "@/components/app/loading-state"
import { MobileFrame } from "@/components/app/mobile-frame"

import { FolderClient } from "./folder-client"

function FolderPageContent() {
  const params = useParams<{ spaceId: string; folderId: string }>()
  const searchParams = useSearchParams()
  const queryType = searchParams.get("type")
  const querySort = searchParams.get("sort")
  const type = queryType === "image" || queryType === "video" ? queryType : "all"
  const sort = querySort === "asc" ? querySort : "desc"

  return <FolderClient spaceId={params.spaceId} folderId={params.folderId} type={type} sort={sort} />
}

export default function FolderPage() {
  return (
    <Suspense fallback={<MobileFrame><LoadingState /></MobileFrame>}>
        <FolderPageContent />
      </Suspense>
  )
}
