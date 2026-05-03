"use client"

import { useParams } from "next/navigation"

import { TrashClient } from "./trash-client"

export default function TrashPage() {
  const params = useParams<{ spaceId: string }>()

  return <TrashClient spaceId={params.spaceId} />
}
