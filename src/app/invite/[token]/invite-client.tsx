"use client"

import { useMemo } from "react"

import { ErrorBanner } from "@/components/app/error-banner"
import { LoadingState } from "@/components/app/loading-state"
import { MobileFrame } from "@/components/app/mobile-frame"
import { Input } from "@/components/ui/input"
import { getInviteViewAction } from "@/features/app/view-actions"
import { registerAction } from "@/features/auth/actions"
import { useServerAction } from "@/hooks/use-server-action"

export function InviteClient({
  token,
  error,
}: {
  token: string
  error?: string
}) {
  const { data, loading } = useServerAction(() => getInviteViewAction(token), [token])
  const action = useMemo(() => registerAction.bind(null, token), [token])

  return (
    <MobileFrame variant="auth">
      <div className="ca-auth-copy">
        <h1>完成注册</h1>
      </div>

      {loading ? <LoadingState /> : null}
      {!loading && !data ? <ErrorBanner message="邀请链接无效或已处理" /> : null}

      {data ? (
        <form action={action} className="ca-form-stack">
          <ErrorBanner message={error} />
          <label className="ca-field">
            <span>手机号</span>
            <Input value={data.phone} readOnly className="ca-input text-muted-foreground" />
          </label>
          <label className="ca-field">
            <span>昵称</span>
            <Input name="name" autoComplete="nickname" className="ca-input" />
          </label>
          <label className="ca-field">
            <span>设置密码</span>
            <Input name="password" type="password" autoComplete="new-password" className="ca-input" />
          </label>
          <label className="ca-field">
            <span>确认密码</span>
            <Input name="confirmPassword" type="password" autoComplete="new-password" className="ca-input" />
          </label>
          <button className="ca-primary-btn">创建账号</button>
        </form>
      ) : null}
    </MobileFrame>
  )
}
