import 'server-only'

import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { accountInvites, users } from '@/db/schema'
import { hashInviteToken, normalizePhone, safeName } from '@/lib/security'

import { ensureBootstrapAdmin } from './bootstrap'
import { createSession, destroySession } from './session'
import { findPendingInviteByTokenHash, findUserByPhone } from './queries'

const validatePassword = (password: string) => {
  if (password.length < 8) {
    throw new Error('密码至少需要 8 位')
  }
}

export const login = async (phone: string, password: string) => {
  await ensureBootstrapAdmin()
  const user = await findUserByPhone(normalizePhone(phone))

  if (!user) {
    throw new Error('手机号或密码错误')
  }

  if (user.disabledAt) {
    throw new Error('账号已被禁用')
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash)

  if (!passwordMatches) {
    throw new Error('手机号或密码错误')
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id))
  await createSession(user.id)

  return '/spaces'
}

export const logout = async () => {
  await destroySession()
}

export const getInviteForToken = async (token: string) =>
  findPendingInviteByTokenHash(hashInviteToken(token))

export const registerWithInvite = async (
  token: string,
  name: string,
  password: string,
  confirmPassword: string
) => {
  const finalName = safeName(name)

  if (!finalName) {
    throw new Error('请填写昵称')
  }

  validatePassword(password)

  if (password !== confirmPassword) {
    throw new Error('两次输入的密码不一致')
  }

  const invite = await getInviteForToken(token)

  if (!invite) {
    throw new Error('邀请链接无效或已处理')
  }

  const existing = await findUserByPhone(invite.phone)

  if (existing) {
    throw new Error('该手机号已经注册')
  }

  const user = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        phone: invite.phone,
        name: finalName,
        passwordHash: await bcrypt.hash(password, 12),
      })
      .returning()

    await tx
      .update(accountInvites)
      .set({
        status: 'accepted',
        acceptedUserId: created.id,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(accountInvites.id, invite.id))

    return created
  })

  await createSession(user.id)
}
