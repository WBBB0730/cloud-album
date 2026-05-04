'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { ErrorBanner } from '@/components/app/error-banner'
import { useGlobalLoading } from '@/components/app/global-loading'
import { MobileFrame } from '@/components/app/mobile-frame'
import { Input } from '@/components/ui/input'
import { loginAction } from '@/features/auth/actions'

export function LoginClient() {
  const router = useRouter()
  const { hideLoading } = useGlobalLoading()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setPending(true)

    try {
      const result = await loginAction(new FormData(event.currentTarget))

      if (!result.ok || !result.destination) {
        setError(result.error ?? '登录失败')
        return
      }

      router.replace(result.destination)
    } finally {
      setPending(false)
      hideLoading()
    }
  }

  return (
    <MobileFrame variant="auth">
      <div className="ca-auth-copy">
        <h1>云相册</h1>
      </div>

      <form onSubmit={handleSubmit} className="ca-form-stack">
        <ErrorBanner message={error ?? undefined} />
        <label className="ca-field">
          <span>手机号</span>
          <Input
            name="phone"
            inputMode="tel"
            autoComplete="tel"
            className="ca-input"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
        <label className="ca-field">
          <span>密码</span>
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            className="ca-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="ca-primary-btn" disabled={pending}>
          登录
        </button>
      </form>
    </MobileFrame>
  )
}
