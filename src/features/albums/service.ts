import 'server-only'

import { and, desc, eq, inArray, isNull } from 'drizzle-orm'

import { db } from '@/db/client'
import { deleteBatches, folders, media } from '@/db/schema'
import { requireSpaceMember } from '@/features/spaces/service'
import { getSignedReadUrl } from '@/lib/cos'
import { safeName } from '@/lib/security'

import {
  getActiveMediaById,
  getFolderById,
  listActiveFolders,
  listActiveMedia,
} from './queries'

export const getAlbumHome = async (spaceId: string, userId: string) => {
  const space = await requireSpaceMember(spaceId, userId)
  const folderRows = await listActiveFolders(spaceId)

  return {
    space,
    folders: folderRows.map((folder) => ({
      ...folder,
      coverUrl: folder.cover ? getSignedReadUrl(folder.cover.cosKey) : null,
      coverType: folder.cover?.type ?? null,
    })),
  }
}

export const createFolder = async (
  spaceId: string,
  userId: string,
  name: string
) => {
  await requireSpaceMember(spaceId, userId)
  const finalName = safeName(name)

  if (!finalName) {
    throw new Error('请输入相册名称')
  }

  const [folder] = await db
    .insert(folders)
    .values({ spaceId, name: finalName, createdBy: userId })
    .returning()

  return folder
}

export const getFolderDetail = async (
  spaceId: string,
  folderId: string,
  userId: string
) => {
  const space = await requireSpaceMember(spaceId, userId)
  const folder = await getFolderById(spaceId, folderId)

  if (!folder || folder.deletedAt || folder.permanentlyDeletedAt) {
    throw new Error('相册不存在')
  }

  const items = await listActiveMedia(spaceId, folderId)

  return {
    space,
    folder,
    media: items.map((item) => ({
      ...item,
      url: getSignedReadUrl(item.cosKey),
    })),
  }
}

export const deleteMedia = async (
  spaceId: string,
  mediaId: string,
  userId: string
) => {
  await deleteActiveMedia(spaceId, [mediaId], userId, '媒体不存在')
}

export const deleteMediaBatch = async (
  spaceId: string,
  mediaIds: string[],
  userId: string
) => {
  await deleteActiveMedia(spaceId, mediaIds, userId, '部分媒体不存在')
}

const deleteActiveMedia = async (
  spaceId: string,
  mediaIds: string[],
  userId: string,
  missingMessage: string
) => {
  await requireSpaceMember(spaceId, userId)
  const uniqueIds = Array.from(new Set(mediaIds.filter(Boolean)))

  if (uniqueIds.length === 0) {
    throw new Error('请选择要删除的媒体')
  }

  await db.transaction(async (tx) => {
    const now = new Date()
    const [batch] = await tx
      .insert(deleteBatches)
      .values({ spaceId, deletedBy: userId, reason: 'delete_media' })
      .returning()

    const deletedItems = await tx
      .update(media)
      .set({
        deletedAt: now,
        deletedBy: userId,
        deleteBatchId: batch.id,
        updatedAt: now,
      })
      .where(
        and(
          eq(media.spaceId, spaceId),
          inArray(media.id, uniqueIds),
          eq(media.status, 'ready'),
          isNull(media.deletedAt),
          isNull(media.permanentlyDeletedAt)
        )
      )
      .returning({ id: media.id })

    if (deletedItems.length !== uniqueIds.length) {
      throw new Error(missingMessage)
    }

    const affectedFolders = await tx
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.spaceId, spaceId),
          inArray(folders.coverMediaId, uniqueIds),
          isNull(folders.deletedAt),
          isNull(folders.permanentlyDeletedAt)
        )
      )

    for (const folder of affectedFolders) {
      const [latestCover] = await tx
        .select({ id: media.id })
        .from(media)
        .where(
          and(
            eq(media.spaceId, spaceId),
            eq(media.folderId, folder.id),
            eq(media.status, 'ready'),
            isNull(media.deletedAt),
            isNull(media.permanentlyDeletedAt)
          )
        )
        .orderBy(desc(media.takenAt), desc(media.createdAt))
        .limit(1)

      await tx
        .update(folders)
        .set({
          coverMediaId: latestCover?.id ?? null,
          updatedAt: now,
        })
        .where(and(eq(folders.id, folder.id), eq(folders.spaceId, spaceId)))
    }
  })
}

export const setFolderCover = async (
  spaceId: string,
  folderId: string,
  mediaId: string,
  userId: string
) => {
  await requireSpaceMember(spaceId, userId)
  const folder = await getFolderById(spaceId, folderId)

  if (!folder || folder.deletedAt || folder.permanentlyDeletedAt) {
    throw new Error('相册不存在')
  }

  const item = await getActiveMediaById(spaceId, mediaId)

  if (!item || item.folderId !== folder.id) {
    throw new Error('媒体不存在')
  }

  await db
    .update(folders)
    .set({
      coverMediaId: item.id,
      updatedAt: new Date(),
    })
    .where(and(eq(folders.id, folder.id), eq(folders.spaceId, spaceId)))
}

export const deleteFolder = async (
  spaceId: string,
  folderId: string,
  userId: string
) => {
  await requireSpaceMember(spaceId, userId)
  const folder = await getFolderById(spaceId, folderId)

  if (!folder || folder.deletedAt || folder.permanentlyDeletedAt) {
    throw new Error('相册不存在')
  }

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(deleteBatches)
      .values({ spaceId, deletedBy: userId, reason: 'delete_folder' })
      .returning()

    await tx
      .update(folders)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
        deleteBatchId: batch.id,
        updatedAt: new Date(),
      })
      .where(eq(folders.id, folder.id))

    await tx
      .update(media)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
        deleteBatchId: batch.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(media.folderId, folder.id),
          isNull(media.deletedAt),
          isNull(media.permanentlyDeletedAt)
        )
      )
  })
}

export const getMediaPreview = async (
  spaceId: string,
  folderId: string,
  mediaId: string,
  userId: string
) => {
  const detail = await getFolderDetail(spaceId, folderId, userId)
  const index = detail.media.findIndex((item) => item.id === mediaId)

  if (index < 0) {
    throw new Error('媒体不存在')
  }

  return { ...detail, index, item: detail.media[index] }
}
