import "server-only"

import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm"

import { db } from "@/db/client"
import { folders, media } from "@/db/schema"
import { getFolderById } from "@/features/albums/queries"
import { requireSpaceMember } from "@/features/spaces/service"
import { getSignedReadUrl } from "@/lib/cos"

import {
  getTrashUserName,
  listDeletedMediaInFolder,
  listFoldersForTrash,
} from "./queries"

export const getTrashHome = async (spaceId: string, userId: string) => {
  const space = await requireSpaceMember(spaceId, userId)
  const folderRows = await listFoldersForTrash(spaceId)
  const result = []

  for (const folder of folderRows) {
    const deletedMedia = await listDeletedMediaInFolder(spaceId, folder.id)

    if (!folder.deletedAt && deletedMedia.length === 0) {
      continue
    }

    const deletedAt = folder.deletedAt ?? deletedMedia[0]?.deletedAt ?? null
    const deletedBy = folder.deletedBy ?? deletedMedia[0]?.deletedBy ?? null

    result.push({
      ...folder,
      itemCount: deletedMedia.length,
      deletedAt,
      deletedByName: await getTrashUserName(deletedBy),
      coverUrl: deletedMedia[0] ? getSignedReadUrl(deletedMedia[0].cosKey) : null,
    })
  }

  return { space, folders: result }
}

export const getTrashFolder = async (
  spaceId: string,
  folderId: string,
  userId: string
) => {
  const space = await requireSpaceMember(spaceId, userId)
  const folder = await getFolderById(spaceId, folderId)

  if (!folder || folder.permanentlyDeletedAt) {
    throw new Error("回收站相册不存在")
  }

  const items = await listDeletedMediaInFolder(spaceId, folderId)

  return {
    space,
    folder,
    media: items.map((item) => ({ ...item, url: getSignedReadUrl(item.cosKey) })),
  }
}

export const restoreFolderFromTrash = async (
  spaceId: string,
  folderId: string,
  userId: string
) => {
  await requireSpaceMember(spaceId, userId)
  const folder = await getFolderById(spaceId, folderId)

  if (!folder) {
    throw new Error("相册不存在")
  }

  await db.transaction(async (tx) => {
    await tx
      .update(folders)
      .set({
        deletedAt: null,
        deletedBy: null,
        deleteBatchId: null,
        updatedAt: new Date(),
      })
      .where(eq(folders.id, folder.id))

    if (folder.deleteBatchId) {
      await tx
        .update(media)
        .set({
          deletedAt: null,
          deletedBy: null,
          deleteBatchId: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(media.folderId, folder.id),
            eq(media.deleteBatchId, folder.deleteBatchId),
            isNull(media.permanentlyDeletedAt)
          )
        )
    }
  })
}

export const restoreMediaFromTrash = async (
  spaceId: string,
  mediaId: string,
  userId: string
) => {
  await restoreMediaBatchFromTrash(spaceId, [mediaId], userId, "媒体不存在")
}

export const restoreMediaBatchFromTrash = async (
  spaceId: string,
  mediaIds: string[],
  userId: string,
  missingMessage = "部分媒体不存在"
) => {
  await requireSpaceMember(spaceId, userId)
  const uniqueIds = Array.from(new Set(mediaIds.filter(Boolean)))

  if (uniqueIds.length === 0) {
    throw new Error("请选择要恢复的媒体")
  }

  const restoredItems = await db
    .update(media)
    .set({
      deletedAt: null,
      deletedBy: null,
      deleteBatchId: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(media.spaceId, spaceId),
        inArray(media.id, uniqueIds),
        isNotNull(media.deletedAt),
        isNull(media.permanentlyDeletedAt)
      )
    )
    .returning({ id: media.id })

  if (restoredItems.length !== uniqueIds.length) {
    throw new Error(missingMessage)
  }
}

export const permanentlyDeleteMedia = async (
  spaceId: string,
  mediaId: string,
  userId: string
) => {
  await permanentlyDeleteMediaBatch(spaceId, [mediaId], userId, "媒体不存在")
}

export const permanentlyDeleteMediaBatch = async (
  spaceId: string,
  mediaIds: string[],
  userId: string,
  missingMessage = "部分媒体不存在"
) => {
  await requireSpaceMember(spaceId, userId)
  const uniqueIds = Array.from(new Set(mediaIds.filter(Boolean)))

  if (uniqueIds.length === 0) {
    throw new Error("请选择要永久删除的媒体")
  }

  const deletedItems = await db
    .update(media)
    .set({
      permanentlyDeletedAt: new Date(),
      permanentlyDeletedBy: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(media.spaceId, spaceId),
        inArray(media.id, uniqueIds),
        isNotNull(media.deletedAt),
        isNull(media.permanentlyDeletedAt)
      )
    )
    .returning({ id: media.id })

  if (deletedItems.length !== uniqueIds.length) {
    throw new Error(missingMessage)
  }
}

export const permanentlyDeleteFolder = async (
  spaceId: string,
  folderId: string,
  userId: string
) => {
  await requireSpaceMember(spaceId, userId)
  const folder = await getFolderById(spaceId, folderId)

  if (!folder) {
    throw new Error("相册不存在")
  }

  await db.transaction(async (tx) => {
    await tx
      .update(folders)
      .set({
        permanentlyDeletedAt: new Date(),
        permanentlyDeletedBy: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(folders.id, folder.id), isNotNull(folders.deletedAt)))

    await tx
      .update(media)
      .set({
        permanentlyDeletedAt: new Date(),
        permanentlyDeletedBy: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(media.folderId, folder.id), isNotNull(media.deletedAt), isNull(media.permanentlyDeletedAt)))
  })
}
