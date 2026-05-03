"use client"

import { Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import { ErrorBanner } from "@/components/app/error-banner"
import { LoadingState } from "@/components/app/loading-state"
import { MobileFrame } from "@/components/app/mobile-frame"
import { TopBar } from "@/components/app/top-bar"
import { Input } from "@/components/ui/input"
import { createSpaceAction } from "@/features/spaces/actions"

function NewSpaceContent() {
  const searchParams = useSearchParams()

  return (
    <MobileFrame className="ca-scroll-layout">
      <div className="ca-fixed-section">
        <TopBar
          title="新建空间"
          leading={
            <Link href="/spaces" className="ca-icon-btn" aria-label="返回">
              <ChevronLeft />
            </Link>
          }
        />
      </div>
      <div className="ca-scroll-section">
        <form action={createSpaceAction} className="ca-form-stack">
          <ErrorBanner message={searchParams.get("error") ?? undefined} />
          <label className="ca-field">
            <span>空间名称</span>
            <Input name="name" className="ca-input" />
          </label>
          <button className="ca-primary-btn">创建空间</button>
        </form>
      </div>
    </MobileFrame>
  )
}

export function NewSpaceClient() {
  return (
    <Suspense fallback={<MobileFrame><LoadingState /></MobileFrame>}>
      <NewSpaceContent />
    </Suspense>
  )
}
