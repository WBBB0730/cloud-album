import "server-only"

import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"

import { db } from "@/db/client"
import { users } from "@/db/schema"
import { env } from "@/lib/env"
import { normalizePhone, safeName } from "@/lib/security"

let bootstrapPromise: Promise<void> | null = null

const runBootstrap = async () => {
  const phone = normalizePhone(env.bootstrapAdminPhone)
  const [existing] = await db.select().from(users).where(eq(users.phone, phone)).limit(1)

  if (existing) {
    if (!existing.isGlobalAdmin) {
      await db
        .update(users)
        .set({ isGlobalAdmin: true, updatedAt: new Date() })
        .where(eq(users.id, existing.id))
    }
    return
  }

  const passwordHash = await bcrypt.hash(env.bootstrapAdminPassword, 12)

  await db.insert(users).values({
    phone,
    name: safeName(env.bootstrapAdminName) || "管理员",
    passwordHash,
    isGlobalAdmin: true,
  })
}

export const ensureBootstrapAdmin = async () => {
  bootstrapPromise ??= runBootstrap()
  await bootstrapPromise
}
