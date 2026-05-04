'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireUser } from '@/features/auth/session'

import {
  permanentlyDeleteFolder,
  permanentlyDeleteMedia,
  permanentlyDeleteMediaBatch,
  restoreFolderFromTrash,
  restoreMediaBatchFromTrash,
  restoreMediaFromTrash,
} from './service'

export const restoreFolderAction = async (
  spaceId: string,
  folderId: string
) => {
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
  revalidatePath(`/spaces/${spaceId}`)
  revalidatePath(`/spaces/${spaceId}/albums/${folderId}`)
  revalidatePath(`/spaces/${spaceId}/trash/${folderId}`)
  redirect(`/spaces/${spaceId}/trash/${folderId}`)
}

export const restoreMediaBatchAction = async (
  spaceId: string,
  folderId: string,
  mediaIds: string[]
) => {
  const user = await requireUser()

  try {
    await restoreMediaBatchFromTrash(spaceId, mediaIds, user.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : '恢复失败'
    return { ok: false, error: message }
  }

  revalidatePath(`/spaces/${spaceId}`)
  revalidatePath(`/spaces/${spaceId}/albums/${folderId}`)
  revalidatePath(`/spaces/${spaceId}/trash`)
  revalidatePath(`/spaces/${spaceId}/trash/${folderId}`)
  return { ok: true, error: null }
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

export const permanentMediaBatchAction = async (
  spaceId: string,
  folderId: string,
  mediaIds: string[]
) => {
  const user = await requireUser()

  try {
    await permanentlyDeleteMediaBatch(spaceId, mediaIds, user.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : '永久删除失败'
    return { ok: false, error: message }
  }

  revalidatePath(`/spaces/${spaceId}/trash`)
  revalidatePath(`/spaces/${spaceId}/trash/${folderId}`)
  return { ok: true, error: null }
}

export const permanentFolderAction = async (
  spaceId: string,
  folderId: string
) => {
  const user = await requireUser()
  await permanentlyDeleteFolder(spaceId, folderId, user.id)
  revalidatePath(`/spaces/${spaceId}/trash`)
  redirect(`/spaces/${spaceId}/trash`)
}
