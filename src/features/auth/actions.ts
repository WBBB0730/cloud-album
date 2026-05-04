'use server'

import { redirect } from 'next/navigation'

import { login, logout, registerWithInvite } from './service'

export const loginAction = async (formData: FormData) => {
  try {
    const destination = await login(
      String(formData.get('phone') ?? ''),
      String(formData.get('password') ?? '')
    )
    return { ok: true, destination, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : '登录失败'
    return { ok: false, destination: null, error: message }
  }
}

export const logoutAction = async () => {
  await logout()
  redirect('/login')
}

export const registerAction = async (token: string, formData: FormData) => {
  try {
    await registerWithInvite(
      token,
      String(formData.get('name') ?? ''),
      String(formData.get('password') ?? ''),
      String(formData.get('confirmPassword') ?? '')
    )
    return { ok: true, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : '注册失败'
    return { ok: false, error: message }
  }
}
