import "server-only"

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"

import { db } from "@/db/client"
import { folders, spaceMembers, spaces, users } from "@/db/schema"

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

  if (rows.length === 0) {
    return []
  }

  const spaceIds = rows.map((space) => space.id)
  const [memberCounts, folderCounts] = await Promise.all([
    db
      .select({
        spaceId: spaceMembers.spaceId,
        value: sql<number>`count(*)::int`,
      })
      .from(spaceMembers)
      .where(inArray(spaceMembers.spaceId, spaceIds))
      .groupBy(spaceMembers.spaceId),
    db
      .select({
        spaceId: folders.spaceId,
        value: sql<number>`count(*)::int`,
      })
      .from(folders)
      .where(
        and(
          inArray(folders.spaceId, spaceIds),
          isNull(folders.deletedAt),
          isNull(folders.permanentlyDeletedAt)
        )
      )
      .groupBy(folders.spaceId),
  ])
  const memberCountBySpace = new Map(memberCounts.map((row) => [row.spaceId, row.value]))
  const folderCountBySpace = new Map(folderCounts.map((row) => [row.spaceId, row.value]))

  return rows.map((space) => ({
    ...space,
    memberCount: memberCountBySpace.get(space.id) ?? 0,
    folderCount: folderCountBySpace.get(space.id) ?? 0,
  }))
}

export const getSpace = async (spaceId: string) => {
  const [space] = await db.select().from(spaces).where(eq(spaces.id, spaceId)).limit(1)
  return space ?? null
}

export const listSpaceMembers = async (spaceId: string) =>
  db
    .select({
      id: spaceMembers.id,
      userId: users.id,
      name: users.name,
      phone: users.phone,
      isGlobalAdmin: users.isGlobalAdmin,
      joinedAt: spaceMembers.createdAt,
    })
    .from(spaceMembers)
    .innerJoin(users, eq(users.id, spaceMembers.userId))
    .where(eq(spaceMembers.spaceId, spaceId))
    .orderBy(desc(spaceMembers.createdAt))
