import "server-only"

import { and, eq } from "drizzle-orm"

import { db } from "@/db/client"
import { accountInvites, folders, media, users } from "@/db/schema"
import { env } from "@/lib/env"
import { hashInviteToken, normalizePhone, randomToken } from "@/lib/security"

import {
  listInvites,
  listPermanentFolders,
  listPermanentMedia,
  listSpaces,
  listUsers,
} from "./queries"

export const getAdminDashboard = async () => {
  const [invites, userRows, spaceRows, permanentMedia, permanentFolders] = await Promise.all([
    listInvites(),
    listUsers(),
    listSpaces(),
    listPermanentMedia(),
    listPermanentFolders(),
  ])

  return {
    invites,
    users: userRows,
    spaces: spaceRows,
    permanentRecords: [
      ...permanentMedia.map((item) => ({
        ...item,
        recordType: "media" as const,
        kind: item.kind === "video" ? "视频" : "图片",
      })),
      ...permanentFolders.map((item) => ({
        ...item,
        recordType: "folder" as const,
        kind: "相册",
      })),
    ].sort((a, b) => {
      const left = a.permanentlyDeletedAt?.getTime() ?? 0
      const right = b.permanentlyDeletedAt?.getTime() ?? 0
      return right - left
    }),
  }
}

export const createInvite = async (adminId: string, phone: string) => {
  const finalPhone = normalizePhone(phone)

  if (!finalPhone) {
    throw new Error("请填写手机号")
  }

  const [existingUser] = await db.select().from(users).where(eq(users.phone, finalPhone)).limit(1)

  if (existingUser) {
    throw new Error("该手机号已经注册")
  }

  const [pendingInvite] = await db
    .select()
    .from(accountInvites)
    .where(and(eq(accountInvites.phone, finalPhone), eq(accountInvites.status, "pending")))
    .limit(1)

  if (pendingInvite) {
    throw new Error("该手机号已经有待处理邀请")
  }

  const token = randomToken()

  await db.insert(accountInvites).values({
    phone: finalPhone,
    name: finalPhone,
    tokenHash: hashInviteToken(token),
    invitedBy: adminId,
  })

  return `${env.appUrl.replace(/\/$/, "")}/invite/${token}`
}

export const revokeInvite = async (adminId: string, inviteId: string) => {
  await db
    .update(accountInvites)
    .set({
      status: "revoked",
      revokedBy: adminId,
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(accountInvites.id, inviteId), eq(accountInvites.status, "pending")))
}

export const adminRestorePermanentRecord = async (
  kind: "media" | "folder",
  recordId: string
) => {
  if (kind === "media") {
    await db
      .update(media)
      .set({
        deletedAt: null,
        deletedBy: null,
        permanentlyDeletedAt: null,
        permanentlyDeletedBy: null,
        deleteBatchId: null,
        updatedAt: new Date(),
      })
      .where(eq(media.id, recordId))
    return
  }

  const [folder] = await db.select().from(folders).where(eq(folders.id, recordId)).limit(1)

  if (!folder) {
    return
  }

  await db.transaction(async (tx) => {
    await tx
      .update(folders)
      .set({
        deletedAt: null,
        deletedBy: null,
        permanentlyDeletedAt: null,
        permanentlyDeletedBy: null,
        deleteBatchId: null,
        updatedAt: new Date(),
      })
      .where(eq(folders.id, recordId))

    if (folder.deleteBatchId) {
      await tx
        .update(media)
        .set({
          deletedAt: null,
          deletedBy: null,
          permanentlyDeletedAt: null,
          permanentlyDeletedBy: null,
          deleteBatchId: null,
          updatedAt: new Date(),
        })
        .where(eq(media.deleteBatchId, folder.deleteBatchId))
    }
  })
}
