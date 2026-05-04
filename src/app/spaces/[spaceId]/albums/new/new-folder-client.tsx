"use client"

import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { ErrorBanner } from "@/components/app/error-banner"
import { LoadingState } from "@/components/app/loading-state"
import { MobileFrame } from "@/components/app/mobile-frame"
import { TopBar } from "@/components/app/top-bar"
import { Input } from "@/components/ui/input"
import { createFolderAction } from "@/features/albums/actions"
import { getNewFolderViewAction } from "@/features/app/view-actions"
import { useServerAction } from "@/hooks/use-server-action"

export function NewFolderClient({
  spaceId,
  error,
}: {
  spaceId: string
  error?: string
}) {
  const { data, loading } = useServerAction(() => getNewFolderViewAction(spaceId), [spaceId])
  const action = createFolderAction.bind(null, spaceId)

  return (
    <MobileFrame className="ca-scroll-layout">
      <div className="ca-fixed-section">
        <TopBar
          title="新建相册"
          subtitle={data?.space.name}
          leading={
            <Link replace href={`/spaces/${spaceId}`} className="ca-icon-btn" aria-label="返回">
              <ChevronLeft />
            </Link>
          }
        />
      </div>
      <div className="ca-scroll-section">
        {loading ? <LoadingState /> : null}
        <form action={action} className="ca-form-stack">
          <ErrorBanner message={error} />
          <label className="ca-field">
            <span>相册名称</span>
            <Input name="name" className="ca-input" />
          </label>
          <button className="ca-primary-btn">创建相册</button>
        </form>
      </div>
    </MobileFrame>
  )
}
