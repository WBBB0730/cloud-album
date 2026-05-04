import "server-only"

import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"

import { db } from "@/db/client"
import { folders, media, users } from "@/db/schema"
import { getFolderById } from "@/features/albums/queries"
import { requireSpaceMember } from "@/features/spaces/service"
import { getSignedReadUrl } from "@/lib/cos"

import {
  listDeletedMediaInFolder,
  listFoldersForTrash,
} from "./queries"

export const getTrashHome = async (spaceId: string, userId: string) => {
  const space = await requireSpaceMember(spaceId, userId)
  const folderRows = await listFoldersForTrash(spaceId)

  if (folderRows.length === 0) {
    return { space, folders: [] }
  }

  const folderIds = folderRows.map((folder) => folder.id)
  const [deletedCounts, deletedCovers] = await Promise.all([
    db
      .select({
        folderId: media.folderId,
        value: sql<number>`count(*)::int`,
      })
      .from(media)
      .where(
        and(
          eq(media.spaceId, spaceId),
          inArray(media.folderId, folderIds),
          eq(media.status, "ready"),
          isNotNull(media.deletedAt),
          isNull(media.permanentlyDeletedAt)
        )
      )
      .groupBy(media.folderId),
    db
      .selectDistinctOn([media.folderId])
      .from(media)
      .where(
        and(
          eq(media.spaceId, spaceId),
          inArray(media.folderId, folderIds),
          eq(media.status, "ready"),
          isNotNull(media.deletedAt),
          isNull(media.permanentlyDeletedAt)
        )
      )
      .orderBy(media.folderId, desc(media.deletedAt), desc(media.takenAt)),
  ])
  const countByFolder = new Map(deletedCounts.map((row) => [row.folderId, row.value]))
  const coverByFolder = new Map(deletedCovers.map((item) => [item.folderId, item]))
  const deletedByIds = Array.from(new Set(
    folderRows
      .map((folder) => folder.deletedBy)
      .concat(deletedCovers.map((item) => item.deletedBy))
      .filter((id): id is string => Boolean(id))
  ))
  const deletedUsers = deletedByIds.length > 0
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, deletedByIds))
    : []
  const userNameById = new Map(deletedUsers.map((user) => [user.id, user.name]))
  const result = folderRows.flatMap((folder) => {
    const deletedMediaCount = countByFolder.get(folder.id) ?? 0
    const cover = coverByFolder.get(folder.id) ?? null

    if (!folder.deletedAt && deletedMediaCount === 0) {
      return []
    }

    const deletedAt = folder.deletedAt ?? cover?.deletedAt ?? null
    const deletedBy = folder.deletedBy ?? cover?.deletedBy ?? null

    return [{
      ...folder,
      itemCount: deletedMediaCount,
      deletedAt,
      deletedByName: deletedBy ? userNameById.get(deletedBy) ?? "未知用户" : "未知用户",
      coverUrl: cover ? getSignedReadUrl(cover.cosKey) : null,
    }]
  })

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
