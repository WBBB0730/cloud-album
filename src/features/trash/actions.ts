"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireUser } from "@/features/auth/session"

import {
  permanentlyDeleteFolder,
  permanentlyDeleteMedia,
  restoreFolderFromTrash,
  restoreMediaFromTrash,
} from "./service"

export const restoreFolderAction = async (spaceId: string, folderId: string) => {
  const user = await requireUser()
  await restoreFolderFromTrash(spaceId, folderId, user.id)
  revalidatePath(`/spaces/${spaceId}/trash`)
  redirect(`/spaces/${spaceId}`)
}

export const restoreMediaAction = async (
  spaceId: string,
  folderId: string,
  mediaId: string
) => {
  const user = await requireUser()
  await restoreMediaFromTrash(spaceId, mediaId, user.id)
  revalidatePath(`/spaces/${spaceId}/trash/${folderId}`)
  redirect(`/spaces/${spaceId}/trash/${folderId}`)
}

export const permanentMediaAction = async (
  spaceId: string,
  folderId: string,
  mediaId: string
) => {
  const user = await requireUser()
  await permanentlyDeleteMedia(spaceId, mediaId, user.id)
  revalidatePath(`/spaces/${spaceId}/trash/${folderId}`)
  redirect(`/spaces/${spaceId}/trash/${folderId}`)
}

export const permanentFolderAction = async (spaceId: string, folderId: string) => {
  const user = await requireUser()
  await permanentlyDeleteFolder(spaceId, folderId, user.id)
  revalidatePath(`/spaces/${spaceId}/trash`)
  redirect(`/spaces/${spaceId}/trash`)
}
