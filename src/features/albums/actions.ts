'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireUser } from '@/features/auth/session'

import {
  createFolder,
  deleteFolder,
  deleteMedia,
  deleteMediaBatch,
  setFolderCover,
} from './service'

const withError = (path: string, error: unknown) => {
  const message = error instanceof Error ? error.message : '操作失败'
  redirect(`${path}?error=${encodeURIComponent(message)}`)
}

export const createFolderAction = async (
  spaceId: string,
  formData: FormData
) => {
  const user = await requireUser()
  let folderId = ''

  try {
    const folder = await createFolder(
      spaceId,
      user.id,
      String(formData.get('name') ?? '')
    )
    folderId = folder.id
  } catch (error) {
    withError(`/spaces/${spaceId}`, error)
  }

  revalidatePath(`/spaces/${spaceId}`)
  redirect(`/spaces/${spaceId}/albums/${folderId}`)
}

export const deleteFolderAction = async (spaceId: string, folderId: string) => {
  const user = await requireUser()
  await deleteFolder(spaceId, folderId, user.id)
  revalidatePath(`/spaces/${spaceId}`)
  redirect(`/spaces/${spaceId}`)
}

export const deleteMediaAction = async (
  spaceId: string,
  folderId: string,
  mediaId: string
) => {
  const user = await requireUser()
  await deleteMedia(spaceId, mediaId, user.id)
  revalidatePath(`/spaces/${spaceId}`)
  revalidatePath(`/spaces/${spaceId}/albums/${folderId}`)
  redirect(`/spaces/${spaceId}/albums/${folderId}`)
}

export const deleteMediaBatchAction = async (
  spaceId: string,
  folderId: string,
  mediaIds: string[]
) => {
  const user = await requireUser()

  try {
    await deleteMediaBatch(spaceId, mediaIds, user.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除失败'
    return { ok: false, error: message }
  }

  revalidatePath(`/spaces/${spaceId}`)
  revalidatePath(`/spaces/${spaceId}/albums/${folderId}`)
  return { ok: true, error: null }
}

export const setFolderCoverAction = async (
  spaceId: string,
  folderId: string,
  mediaId: string
) => {
  const user = await requireUser()

  try {
    await setFolderCover(spaceId, folderId, mediaId, user.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : '设置封面失败'
    return { ok: false, error: message }
  }

  revalidatePath(`/spaces/${spaceId}`)
  revalidatePath(`/spaces/${spaceId}/albums/${folderId}`)
  return { ok: true, error: null }
}
