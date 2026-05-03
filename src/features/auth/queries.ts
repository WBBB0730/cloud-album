import "server-only"

import { and, eq } from "drizzle-orm"

import { db } from "@/db/client"
import { accountInvites, users } from "@/db/schema"

export const findUserByPhone = async (phone: string) => {
  const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1)
  return user ?? null
}

export const findPendingInviteByTokenHash = async (tokenHash: string) => {
  const [invite] = await db
    .select()
    .from(accountInvites)
    .where(and(eq(accountInvites.tokenHash, tokenHash), eq(accountInvites.status, "pending")))
    .limit(1)

  return invite ?? null
}
