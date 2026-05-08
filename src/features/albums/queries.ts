import 'server-only'

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { folders, media, users } from '@/db/schema'

export const getFolderById = async (spaceId: string, folderId: string) => {
  const [folder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.spaceId, spaceId)))
    .limit(1)

  return folder ?? null
}

export const listActiveFolders = async (spaceId: string) => {
  const rows = await db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.spaceId, spaceId),
        isNull(folders.deletedAt),
        isNull(folders.permanentlyDeletedAt)
      )
    )
    .orderBy(desc(folders.createdAt))

  if (rows.length === 0) {
    return []
  }

  const folderIds = rows.map((folder) => folder.id)
  const coverIds = rows
    .map((folder) => folder.coverMediaId)
    .filter((coverId): coverId is string => Boolean(coverId))
  const [mediaCounts, selectedCovers, latestCovers] = await Promise.all([
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
          eq(media.status, 'ready'),
          isNull(media.deletedAt),
          isNull(media.permanentlyDeletedAt)
        )
      )
      .groupBy(media.folderId),
    coverIds.length > 0
      ? db
          .select()
          .from(media)
          .where(
            and(
              eq(media.spaceId, spaceId),
              inArray(media.id, coverIds),
              eq(media.status, 'ready'),
              isNull(media.deletedAt),
              isNull(media.permanentlyDeletedAt)
            )
          )
      : Promise.resolve([]),
    db
      .selectDistinctOn([media.folderId])
      .from(media)
      .where(
        and(
          eq(media.spaceId, spaceId),
          inArray(media.folderId, folderIds),
          eq(media.status, 'ready'),
          isNull(media.deletedAt),
          isNull(media.permanentlyDeletedAt)
        )
      )
      .orderBy(media.folderId, desc(media.takenAt), desc(media.createdAt)),
  ])
  const mediaCountByFolder = new Map(
    mediaCounts.map((row) => [row.folderId, row.value])
  )
  const selectedCoverById = new Map(
    selectedCovers.map((item) => [item.id, item])
  )
  const latestCoverByFolder = new Map(
    latestCovers.map((item) => [item.folderId, item])
  )

  return rows.map((folder) => {
    const selectedCover = folder.coverMediaId
      ? selectedCoverById.get(folder.coverMediaId)
      : null

    return {
      ...folder,
      mediaCount: mediaCountByFolder.get(folder.id) ?? 0,
      cover:
        (selectedCover?.folderId === folder.id ? selectedCover : null) ??
        latestCoverByFolder.get(folder.id) ??
        null,
    }
  })
}

export const listActiveMedia = async (spaceId: string, folderId: string) => {
  return db
    .select()
    .from(media)
    .where(
      and(
        eq(media.spaceId, spaceId),
        eq(media.folderId, folderId),
        eq(media.status, 'ready'),
        isNull(media.deletedAt),
        isNull(media.permanentlyDeletedAt)
      )
    )
    .orderBy(desc(media.takenAt), desc(media.createdAt))
}

export const getActiveMediaById = async (spaceId: string, mediaId: string) => {
  const [item] = await db
    .select()
    .from(media)
    .where(
      and(
        eq(media.spaceId, spaceId),
        eq(media.id, mediaId),
        eq(media.status, 'ready'),
        isNull(media.deletedAt),
        isNull(media.permanentlyDeletedAt)
      )
    )
    .limit(1)

  return item ?? null
}

export const getReadableMediaById = async (mediaId: string) => {
  const [item] = await db
    .select()
    .from(media)
    .where(
      and(
        eq(media.id, mediaId),
        eq(media.status, 'ready'),
        isNull(media.permanentlyDeletedAt)
      )
    )
    .limit(1)

  return item ?? null
}

export const getUploaderName = async (userId: string) => {
  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return user?.name ?? '未知用户'
}
