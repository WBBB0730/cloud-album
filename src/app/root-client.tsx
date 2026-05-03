"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { LoadingState } from "@/components/app/loading-state"
import { MobileFrame } from "@/components/app/mobile-frame"
import { getRootDestinationAction } from "@/features/app/view-actions"

export function RootClient() {
  const router = useRouter()

  useEffect(() => {
    getRootDestinationAction().then((destination) => {
      router.replace(destination)
    })
  }, [router])

  return (
    <MobileFrame>
      <LoadingState />
    </MobileFrame>
  )
}
