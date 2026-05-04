import "server-only"

import { desc, isNotNull, ne, sql } from "drizzle-orm"

import { db } from "@/db/client"
import { accountInvites, folders, media, users } from "@/db/schema"

export const listInvites = async () =>
  db
    .select({
      id: accountInvites.id,
      phone: accountInvites.phone,
      token: accountInvites.token,
      status: accountInvites.status,
      acceptedAt: accountInvites.acceptedAt,
      createdAt: accountInvites.createdAt,
      updatedAt: accountInvites.updatedAt,
    })
    .from(accountInvites)
    .where(ne(accountInvites.status, "revoked"))
    .orderBy(desc(accountInvites.createdAt))

export const listUsers = async () => db.select().from(users).orderBy(desc(users.createdAt))

export const listPermanentMedia = async () =>
  db
    .select({
      id: media.id,
      kind: media.type,
      name: media.filename,
      spaceId: media.spaceId,
      folderId: media.folderId,
      permanentlyDeletedAt: media.permanentlyDeletedAt,
      permanentlyDeletedBy: media.permanentlyDeletedBy,
    })
    .from(media)
    .where(isNotNull(media.permanentlyDeletedAt))
    .orderBy(desc(media.permanentlyDeletedAt))

export const listPermanentFolders = async () =>
  db
    .select({
      id: folders.id,
      kind: sql<string>`'folder'`,
      name: folders.name,
      spaceId: folders.spaceId,
      folderId: folders.id,
      permanentlyDeletedAt: folders.permanentlyDeletedAt,
      permanentlyDeletedBy: folders.permanentlyDeletedBy,
    })
    .from(folders)
    .where(isNotNull(folders.permanentlyDeletedAt))
    .orderBy(desc(folders.permanentlyDeletedAt))
