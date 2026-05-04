import "server-only"

import { and, eq } from "drizzle-orm"

import { db } from "@/db/client"
import { spaceMembers, spaces, users } from "@/db/schema"
import { normalizePhone, safeName } from "@/lib/security"

import { getMembership, getSpace, listSpaceMembers, listUserSpaces } from "./queries"

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

export const getSpaceMembers = async (spaceId: string, userId: string) => {
  const space = await requireSpaceMember(spaceId, userId)
  const members = await listSpaceMembers(spaceId)

  return {
    space,
    currentUserId: userId,
    members,
  }
}

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
  const finalPhone = normalizePhone(phone)
  const [space, [target]] = await Promise.all([
    requireSpaceMember(spaceId, actorId),
    db.select().from(users).where(eq(users.phone, finalPhone)).limit(1),
  ])

  if (!target) {
    throw new Error("该手机号还没有注册账号")
  }

  await db
    .insert(spaceMembers)
    .values({ spaceId, userId: target.id, addedBy: actorId })
    .onConflictDoNothing()

  return {
    space,
    currentUserId: actorId,
    members: await listSpaceMembers(spaceId),
  }
}

export const leaveSpace = async (userId: string, spaceId: string) => {
  const space = await requireSpaceMember(spaceId, userId)

  if (space.createdBy === userId) {
    throw new Error("创建者不能退出空间")
  }

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

export const removeSpaceMember = async (
  actorId: string,
  spaceId: string,
  targetUserId: string
) => {
  const space = await requireSpaceMember(spaceId, actorId)

  if (actorId === targetUserId) {
    throw new Error("请使用退出空间")
  }

  if (space.createdBy !== actorId) {
    throw new Error("只有创建者可以移除成员")
  }

  if (space.createdBy === targetUserId) {
    throw new Error("创建者不能被移除")
  }

  const targetMembership = await getMembership(spaceId, targetUserId)

  if (!targetMembership) {
    throw new Error("成员不存在")
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, targetUserId)))

    await tx
      .update(users)
      .set({ lastSpaceId: null, updatedAt: new Date() })
      .where(and(eq(users.id, targetUserId), eq(users.lastSpaceId, spaceId)))
  })
}
