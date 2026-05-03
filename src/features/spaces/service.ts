import "server-only"

import { and, eq } from "drizzle-orm"

import { db } from "@/db/client"
import { spaceMembers, spaces, users } from "@/db/schema"
import { normalizePhone, safeName } from "@/lib/security"

import { getMembership, getSpace, listUserSpaces } from "./queries"

export const requireSpaceMember = async (spaceId: string, userId: string) => {
  const [space, membership] = await Promise.all([
    getSpace(spaceId),
    getMembership(spaceId, userId),
  ])

  if (!space || !membership) {
    throw new Error("无权访问该空间")
  }

  return space
}

export const getSpacesForUser = async (userId: string) => listUserSpaces(userId)

export const createSpace = async (userId: string, name: string) => {
  const finalName = safeName(name)

  if (!finalName) {
    throw new Error("请输入空间名称")
  }

  const space = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(spaces)
      .values({ name: finalName, createdBy: userId })
      .returning()

    await tx.insert(spaceMembers).values({
      spaceId: created.id,
      userId,
      addedBy: userId,
    })

    return created
  })

  return space
}

export const addMemberByPhone = async (
  actorId: string,
  spaceId: string,
  phone: string
) => {
  await requireSpaceMember(spaceId, actorId)
  const finalPhone = normalizePhone(phone)
  const [target] = await db.select().from(users).where(eq(users.phone, finalPhone)).limit(1)

  if (!target) {
    throw new Error("该手机号还没有注册账号")
  }

  await db
    .insert(spaceMembers)
    .values({ spaceId, userId: target.id, addedBy: actorId })
    .onConflictDoNothing()
}

export const leaveSpace = async (userId: string, spaceId: string) => {
  await requireSpaceMember(spaceId, userId)

  await db.transaction(async (tx) => {
    await tx
      .delete(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))

    await tx
      .update(users)
      .set({ lastSpaceId: null, updatedAt: new Date() })
      .where(eq(users.id, userId))
  })
}
