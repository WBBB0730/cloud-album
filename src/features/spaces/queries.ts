import "server-only"

import { and, count, desc, eq, isNull } from "drizzle-orm"

import { db } from "@/db/client"
import { folders, spaceMembers, spaces } from "@/db/schema"

export const getMembership = async (spaceId: string, userId: string) => {
  const [membership] = await db
    .select()
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
    .limit(1)

  return membership ?? null
}

export const listUserSpaces = async (userId: string) => {
  const rows = await db
    .select({
      id: spaces.id,
      name: spaces.name,
      createdAt: spaces.createdAt,
      joinedAt: spaceMembers.createdAt,
    })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
    .where(eq(spaceMembers.userId, userId))
    .orderBy(desc(spaceMembers.createdAt))

  return Promise.all(
    rows.map(async (space) => {
      const [memberCount] = await db
        .select({ value: count() })
        .from(spaceMembers)
        .where(eq(spaceMembers.spaceId, space.id))
      const [folderCount] = await db
        .select({ value: count() })
        .from(folders)
        .where(and(eq(folders.spaceId, space.id), isNull(folders.deletedAt), isNull(folders.permanentlyDeletedAt)))

      return {
        ...space,
        memberCount: memberCount?.value ?? 0,
        folderCount: folderCount?.value ?? 0,
      }
    })
  )
}

export const getSpace = async (spaceId: string) => {
  const [space] = await db.select().from(spaces).where(eq(spaces.id, spaceId)).limit(1)
  return space ?? null
}
