'use server'

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/features/auth/session'

import {
  adminRestorePermanentRecord,
  createInvite,
  disableUserAccount,
  revokeInvite,
} from './service'

export const createInviteAction = async (formData: FormData) => {
  const admin = await requireAdmin()

  try {
    const link = await createInvite(
      admin.id,
      String(formData.get('phone') ?? '')
    )
    revalidatePath('/admin')
    return { ok: true, link, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成邀请失败'
    return { ok: false, link: null, error: message }
  }
}

export const revokeInviteAction = async (inviteId: string) => {
  const admin = await requireAdmin()

  try {
    await revokeInvite(admin.id, inviteId)
    revalidatePath('/admin')
    return { ok: true, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : '撤销失败'
    return { ok: false, error: message }
  }
}

export const disableUserAction = async (userId: string) => {
  const admin = await requireAdmin()

  try {
    await disableUserAccount(admin.id, userId)
    revalidatePath('/admin')
    return { ok: true, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : '禁用失败'
    return { ok: false, error: message }
  }
}

export const adminRestoreAction = async (
  kind: 'media' | 'folder',
  recordId: string
) => {
  try {
    await requireAdmin()
    await adminRestorePermanentRecord(kind, recordId)
    revalidatePath('/admin')
    return { ok: true, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : '恢复失败'
    return { ok: false, error: message }
  }
}
