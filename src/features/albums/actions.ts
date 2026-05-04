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

export const createFolderAction = async (
  spaceId: string,
  formData: FormData
) => {
  const user = await requireUser()

  try {
    const folder = await createFolder(
      spaceId,
      user.id,
      String(formData.get('name') ?? '')
    )
    revalidatePath(`/spaces/${spaceId}`)
    return { ok: true, folderId: folder.id, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建相册失败'
    return { ok: false, folderId: null, error: message }
  }
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
