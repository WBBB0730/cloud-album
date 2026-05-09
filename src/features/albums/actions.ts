'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireUser } from '@/features/auth/session'

import {
  copyMediaBatch,
  createFolder,
  deleteFolder,
  deleteMedia,
  deleteMediaBatch,
  getCopyTargetFolders,
  renameFolder,
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

export const renameFolderAction = async (
  spaceId: string,
  folderId: string,
  formData: FormData
) => {
  const user = await requireUser()

  try {
    const folder = await renameFolder(
      spaceId,
      folderId,
      user.id,
      String(formData.get('name') ?? '')
    )
    revalidatePath(`/spaces/${spaceId}`)
    revalidatePath(`/spaces/${spaceId}/albums/${folderId}`)
    return { ok: true, folder, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : '修改相册名称失败'
    return { ok: false, folder: null, error: message }
  }
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

export const getCopyTargetFoldersAction = async (spaceId: string) => {
  const user = await requireUser()

  try {
    const folders = await getCopyTargetFolders(spaceId, user.id)
    return { ok: true, folders, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取相册失败'
    return { ok: false, folders: [], error: message }
  }
}

export const copyMediaBatchAction = async (
  spaceId: string,
  sourceFolderId: string,
  targetFolderId: string,
  mediaIds: string[]
) => {
  const user = await requireUser()

  try {
    const result = await copyMediaBatch(
      spaceId,
      sourceFolderId,
      targetFolderId,
      mediaIds,
      user.id
    )
    revalidatePath(`/spaces/${spaceId}`)
    revalidatePath(`/spaces/${spaceId}/albums/${sourceFolderId}`)
    revalidatePath(`/spaces/${spaceId}/albums/${targetFolderId}`)
    return { ok: true, ...result, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : '复制失败'
    return {
      ok: false,
      copiedCount: 0,
      skippedCount: 0,
      error: message,
    }
  }
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
