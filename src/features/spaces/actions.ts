'use server'

import { requireUser } from '@/features/auth/session'

import {
  addMemberByPhone,
  createSpace,
  leaveSpace,
  removeSpaceMember,
} from './service'

export const createSpaceAction = async (formData: FormData) => {
  const user = await requireUser()

  try {
    const space = await createSpace(user.id, String(formData.get('name') ?? ''))
    return { ok: true, spaceId: space.id, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建空间失败'
    return { ok: false, spaceId: null, error: message }
  }
}

export const addMemberAction = async (spaceId: string, formData: FormData) => {
  const user = await requireUser()

  try {
    const data = await addMemberByPhone(
      user.id,
      spaceId,
      String(formData.get('phone') ?? '')
    )
    return { ok: true, data, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : '操作失败'
    return { ok: false, data: null, error: message }
  }
}

export const leaveSpaceAction = async (spaceId: string) => {
  const user = await requireUser()

  try {
    await leaveSpace(user.id, spaceId)
    return { ok: true, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : '操作失败'
    return { ok: false, error: message }
  }
}

export const removeMemberAction = async (
  spaceId: string,
  targetUserId: string
) => {
  const user = await requireUser()

  try {
    await removeSpaceMember(user.id, spaceId, targetUserId)
    return { ok: true, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : '操作失败'
    return { ok: false, error: message }
  }
}
