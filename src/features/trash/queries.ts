import 'server-only'

import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'

import { db } from '@/db/client'
import { folders, media, users } from '@/db/schema'

export const listFoldersForTrash = async (spaceId: string) =>
  db
    .select()
    .from(folders)
    .where(
      and(eq(folders.spaceId, spaceId), isNull(folders.permanentlyDeletedAt))
    )
    .orderBy(desc(folders.updatedAt))

export const listDeletedMediaInFolder = async (
  spaceId: string,
  folderId: string
) =>
  db
    .select()
    .from(media)
    .where(
      and(
        eq(media.spaceId, spaceId),
        eq(media.folderId, folderId),
        eq(media.status, 'ready'),
        isNotNull(media.deletedAt),
        isNull(media.permanentlyDeletedAt)
      )
    )
    .orderBy(desc(media.deletedAt), desc(media.takenAt))

export const getTrashUserName = async (userId: string | null) => {
  if (!userId) {
    return '未知用户'
  }

  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return user?.name ?? '未知用户'
}
