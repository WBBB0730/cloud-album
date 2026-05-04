'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { ErrorBanner } from '@/components/app/error-banner'
import { useGlobalLoading } from '@/components/app/global-loading'
import { LoadingState } from '@/components/app/loading-state'
import { MobileFrame } from '@/components/app/mobile-frame'
import { Input } from '@/components/ui/input'
import { getInviteViewAction } from '@/features/app/view-actions'
import { registerAction } from '@/features/auth/actions'
import { useServerAction } from '@/hooks/use-server-action'

export function InviteClient({
  token,
}: {
  token: string
}) {
  const router = useRouter()
  const { hideLoading } = useGlobalLoading()
  const { data, loading } = useServerAction(
    () => getInviteViewAction(token),
    [token]
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setPending(true)

    try {
      const result = await registerAction(token, new FormData(event.currentTarget))

      if (!result.ok) {
        setError(result.error ?? '注册失败')
        return
      }

      router.replace('/spaces')
    } finally {
      setPending(false)
      hideLoading()
    }
  }

  return (
    <MobileFrame variant="auth">
      <div className="ca-auth-copy">
        <h1>完成注册</h1>
      </div>

      {loading ? <LoadingState /> : null}
      {!loading && !data ? (
        <ErrorBanner message="邀请链接无效或已处理" />
      ) : null}

      {data ? (
        <form onSubmit={handleSubmit} className="ca-form-stack">
          <ErrorBanner message={error ?? undefined} />
          <label className="ca-field">
            <span>手机号</span>
            <Input
              value={data.phone}
              readOnly
              className="ca-input text-muted-foreground"
            />
          </label>
          <label className="ca-field">
            <span>昵称</span>
            <Input name="name" autoComplete="nickname" className="ca-input" />
          </label>
          <label className="ca-field">
            <span>设置密码</span>
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              className="ca-input"
            />
          </label>
          <label className="ca-field">
            <span>确认密码</span>
            <Input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              className="ca-input"
            />
          </label>
          <button className="ca-primary-btn" disabled={pending}>
            创建账号
          </button>
        </form>
      ) : null}
    </MobileFrame>
  )
}
