import { Suspense } from "react"

import { LoadingState } from "@/components/app/loading-state"
import { MobileFrame } from "@/components/app/mobile-frame"

import { SpacePageClient } from "./page-client"

export default async function SpacePage({
  params,
}: {
  params: Promise<{ spaceId: string }>
}) {
  const { spaceId } = await params

  return (
    <Suspense fallback={<MobileFrame><LoadingState /></MobileFrame>}>
      <SpacePageClient spaceId={spaceId} />
    </Suspense>
  )
}
