import "server-only"

import { and, eq, isNull } from "drizzle-orm"

import { db } from "@/db/client"
import { deleteBatches, folders, media } from "@/db/schema"
import { requireSpaceMember } from "@/features/spaces/service"
import { getSignedReadUrl } from "@/lib/cos"
import { safeName } from "@/lib/security"

import {
  getActiveMediaById,
  getFolderById,
  listActiveFolders,
  listActiveMedia,
} from "./queries"

export const getAlbumHome = async (spaceId: string, userId: string) => {
  const space = await requireSpaceMember(spaceId, userId)
  const folderRows = await listActiveFolders(spaceId)

  return {
    space,
    folders: folderRows.map((folder) => ({
      ...folder,
      coverUrl: folder.cover ? getSignedReadUrl(folder.cover.cosKey) : null,
    })),
  }
}

export const createFolder = async (spaceId: string, userId: string, name: string) => {
  await requireSpaceMember(spaceId, userId)
  const finalName = safeName(name)

  if (!finalName) {
    throw new Error("请输入相册名称")
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
    throw new Error("相册不存在")
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

export const deleteMedia = async (spaceId: string, mediaId: string, userId: string) => {
  await requireSpaceMember(spaceId, userId)
  const item = await getActiveMediaById(spaceId, mediaId)

  if (!item) {
    throw new Error("媒体不存在")
  }

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(deleteBatches)
      .values({ spaceId, deletedBy: userId, reason: "delete_media" })
      .returning()

    await tx
      .update(media)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
        deleteBatchId: batch.id,
        updatedAt: new Date(),
      })
      .where(eq(media.id, item.id))
  })
}

export const deleteFolder = async (spaceId: string, folderId: string, userId: string) => {
  await requireSpaceMember(spaceId, userId)
  const folder = await getFolderById(spaceId, folderId)

  if (!folder || folder.deletedAt || folder.permanentlyDeletedAt) {
    throw new Error("相册不存在")
  }

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(deleteBatches)
      .values({ spaceId, deletedBy: userId, reason: "delete_folder" })
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
    throw new Error("媒体不存在")
  }

  return { ...detail, index, item: detail.media[index] }
}
