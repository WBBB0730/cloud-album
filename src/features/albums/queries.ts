import "server-only"

import { and, count, desc, eq, isNull } from "drizzle-orm"

import { db } from "@/db/client"
import { folders, media, users } from "@/db/schema"

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
    .where(and(eq(folders.spaceId, spaceId), isNull(folders.deletedAt), isNull(folders.permanentlyDeletedAt)))
    .orderBy(desc(folders.createdAt))

  return Promise.all(
    rows.map(async (folder) => {
      const [mediaCount] = await db
        .select({ value: count() })
        .from(media)
        .where(
          and(
            eq(media.folderId, folder.id),
            eq(media.status, "ready"),
            isNull(media.deletedAt),
            isNull(media.permanentlyDeletedAt)
          )
        )
      const [cover] = await db
        .select()
        .from(media)
        .where(
          and(
            eq(media.folderId, folder.id),
            eq(media.status, "ready"),
            isNull(media.deletedAt),
            isNull(media.permanentlyDeletedAt)
          )
        )
        .orderBy(desc(media.takenAt))
        .limit(1)

      return { ...folder, mediaCount: mediaCount?.value ?? 0, cover: cover ?? null }
    })
  )
}

export const listActiveMedia = async (
  spaceId: string,
  folderId: string
) => {
  return db
    .select()
    .from(media)
    .where(
      and(
        eq(media.spaceId, spaceId),
        eq(media.folderId, folderId),
        eq(media.status, "ready"),
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
        eq(media.status, "ready"),
        isNull(media.deletedAt),
        isNull(media.permanentlyDeletedAt)
      )
    )
    .limit(1)

  return item ?? null
}

export const getUploaderName = async (userId: string) => {
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1)
  return user?.name ?? "未知用户"
}
