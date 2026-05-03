"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"

import { ErrorBanner } from "@/components/app/error-banner"
import { LoadingState } from "@/components/app/loading-state"
import { MobileFrame } from "@/components/app/mobile-frame"
import { Input } from "@/components/ui/input"
import { loginAction } from "@/features/auth/actions"

function LoginContent() {
  const searchParams = useSearchParams()

  return (
    <MobileFrame variant="auth">
      <div className="ca-auth-copy">
        <h1>云相册</h1>
      </div>

      <form action={loginAction} className="ca-form-stack">
        <ErrorBanner message={searchParams.get("error") ?? undefined} />
        <label className="ca-field">
          <span>手机号</span>
          <Input name="phone" inputMode="tel" autoComplete="tel" className="ca-input" />
        </label>
        <label className="ca-field">
          <span>密码</span>
          <Input name="password" type="password" autoComplete="current-password" className="ca-input" />
        </label>
        <button className="ca-primary-btn">登录</button>
      </form>
    </MobileFrame>
  )
}

export function LoginClient() {
  return (
    <Suspense fallback={<MobileFrame variant="auth"><LoadingState /></MobileFrame>}>
      <LoginContent />
    </Suspense>
  )
}
