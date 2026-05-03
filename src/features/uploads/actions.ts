"use server"

import { requireUser } from "@/features/auth/session"

import { confirmUploadComplete, createUploadIntent, markUploadFailed } from "./service"

export const createUploadIntentAction = async (input: {
  spaceId: string
  folderId: string
  filename: string
  mimeType: string
  size: number
  width?: number | null
  height?: number | null
  duration?: number | null
  takenAt?: string | null
}) => {
  const user = await requireUser()
  return createUploadIntent(user.id, input)
}

export const confirmUploadAction = async (spaceId: string, sessionId: string) => {
  const user = await requireUser()
  await confirmUploadComplete(user.id, spaceId, sessionId)
}

export const failUploadAction = async (spaceId: string, sessionId: string) => {
  const user = await requireUser()
  await markUploadFailed(user.id, spaceId, sessionId)
}
