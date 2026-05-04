"use client"

import Link from "next/link"
import { ChevronRight, Plus, Settings } from "lucide-react"

import { EmptyState } from "@/components/app/empty-state"
import { LoadingState } from "@/components/app/loading-state"
import { MobileFrame } from "@/components/app/mobile-frame"
import { TopBar } from "@/components/app/top-bar"
import { getSpacesViewAction } from "@/features/app/view-actions"
import { useServerAction } from "@/hooks/use-server-action"

export function SpacesClient() {
  const { data, error, loading } = useServerAction(() => getSpacesViewAction(), [])

  return (
    <MobileFrame className="ca-scroll-layout">
      <div className="ca-fixed-section">
        <TopBar
          title="选择空间"
          actions={
            <>
              {data?.user.isGlobalAdmin ? (
                <Link href="/admin" className="ca-icon-btn" aria-label="管理后台">
                  <Settings />
                </Link>
              ) : null}
            <Link href="/spaces/new" className="ca-icon-btn" aria-label="新建空间">
              <Plus />
            </Link>
            </>
          }
        />
      </div>

      <div className="ca-scroll-section">
        {loading ? <LoadingState /> : null}
        {error ? <EmptyState title={error} /> : null}

        {data ? (
          <div className="ca-list">
            {data.spaces.length > 0 ? (
              data.spaces.map((space) => {
                return (
                  <Link key={space.id} href={`/spaces/${space.id}`} className="ca-space-row w-full text-left">
                      <span className="ca-space-avatar">{space.name.slice(0, 1)}</span>
                      <span className="min-w-0">
                        <strong>{space.name}</strong>
                        <small>
                          {space.memberCount} 位成员 · {space.folderCount} 个相册
                        </small>
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                )
              })
            ) : (
              <EmptyState title="还没有空间">创建一个空间后，就可以邀请家人一起整理照片。</EmptyState>
            )}
          </div>
        ) : null}
      </div>
    </MobileFrame>
  )
}
