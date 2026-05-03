import "server-only"

import { and, eq, gt } from "drizzle-orm"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { db } from "@/db/client"
import { sessions, users } from "@/db/schema"
import { hashSessionToken, randomToken } from "@/lib/security"

export const sessionCookieName = "cloud_album_session"

export type CurrentUser = typeof users.$inferSelect

const sessionMaxAge = 60 * 60 * 24 * 30

export const createSession = async (userId: string) => {
  const token = randomToken()
  const expiresAt = new Date(Date.now() + sessionMaxAge * 1000)

  await db.insert(sessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  })

  const cookieStore = await cookies()
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAge,
  })
}

export const destroySession = async () => {
  const cookieStore = await cookies()
  const token = cookieStore.get(sessionCookieName)?.value

  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)))
  }

  cookieStore.delete(sessionCookieName)
}

export const getCurrentUser = async () => {
  const cookieStore = await cookies()
  const token = cookieStore.get(sessionCookieName)?.value

  if (!token) {
    return null
  }

  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        gt(sessions.expiresAt, new Date())
      )
    )
    .limit(1)

  return row?.user ?? null
}

export const requireUser = async () => {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/login")
  }

  return user
}

export const requireAdmin = async () => {
  const user = await requireUser()

  if (!user.isGlobalAdmin) {
    redirect("/")
  }

  return user
}
