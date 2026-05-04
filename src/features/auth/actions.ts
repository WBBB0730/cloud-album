'use server'

import { redirect } from 'next/navigation'

import { login, logout, registerWithInvite } from './service'

const withError = (path: string, error: unknown) => {
  const message = error instanceof Error ? error.message : '操作失败'
  redirect(`${path}?error=${encodeURIComponent(message)}`)
}

export const loginAction = async (formData: FormData) => {
  let destination = '/spaces'

  try {
    destination = await login(
      String(formData.get('phone') ?? ''),
      String(formData.get('password') ?? '')
    )
  } catch (error) {
    withError('/login', error)
  }

  redirect(destination)
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
  } catch (error) {
    withError(`/invite/${token}`, error)
  }

  redirect('/spaces')
}
