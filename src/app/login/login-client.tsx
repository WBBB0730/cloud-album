'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { ErrorBanner } from '@/components/app/error-banner'
import { LoadingState } from '@/components/app/loading-state'
import { MobileFrame } from '@/components/app/mobile-frame'
import { Input } from '@/components/ui/input'
import { loginAction } from '@/features/auth/actions'

const LOGIN_FORM_CACHE_KEY = 'cloud-album:login-form'

function LoginContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error') ?? undefined
  const [initialValues, setInitialValues] = useState({
    phone: '',
    password: '',
  })
  const shouldRestoreForm = Boolean(error)

  useEffect(() => {
    if (!shouldRestoreForm) {
      window.sessionStorage.removeItem(LOGIN_FORM_CACHE_KEY)
      return
    }

    const saved = window.sessionStorage.getItem(LOGIN_FORM_CACHE_KEY)

    if (!saved) {
      return
    }

    try {
      const values = JSON.parse(saved) as { phone?: string; password?: string }
      setInitialValues({
        phone: values.phone ?? '',
        password: values.password ?? '',
      })
    } catch {
      window.sessionStorage.removeItem(LOGIN_FORM_CACHE_KEY)
    }
  }, [shouldRestoreForm])

  const formKey = useMemo(
    () => `${initialValues.phone}:${initialValues.password}`,
    [initialValues.password, initialValues.phone]
  )

  return (
    <MobileFrame variant="auth">
      <div className="ca-auth-copy">
        <h1>云相册</h1>
      </div>

      <form
        key={formKey}
        action={loginAction}
        className="ca-form-stack"
        onSubmit={(event) => {
          const formData = new FormData(event.currentTarget)

          window.sessionStorage.setItem(
            LOGIN_FORM_CACHE_KEY,
            JSON.stringify({
              phone: String(formData.get('phone') ?? ''),
              password: String(formData.get('password') ?? ''),
            })
          )
        }}
      >
        <ErrorBanner message={error} />
        <label className="ca-field">
          <span>手机号</span>
          <Input
            name="phone"
            inputMode="tel"
            autoComplete="tel"
            className="ca-input"
            defaultValue={initialValues.phone}
          />
        </label>
        <label className="ca-field">
          <span>密码</span>
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            className="ca-input"
            defaultValue={initialValues.password}
          />
        </label>
        <button className="ca-primary-btn">登录</button>
      </form>
    </MobileFrame>
  )
}

export function LoginClient() {
  return (
    <Suspense
      fallback={
        <MobileFrame variant="auth">
          <LoadingState />
        </MobileFrame>
      }
    >
      <LoginContent />
    </Suspense>
  )
}
