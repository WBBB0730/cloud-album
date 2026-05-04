"use client"

import Link from "next/link"
import { ChevronLeft, Play, RotateCcw, Trash2 } from "lucide-react"

import { EmptyState } from "@/components/app/empty-state"
import { LoadingState } from "@/components/app/loading-state"
import { MediaThumbnail } from "@/components/app/media-thumbnail"
import { MobileFrame } from "@/components/app/mobile-frame"
import { TopBar } from "@/components/app/top-bar"
import { getTrashFolderViewAction } from "@/features/app/view-actions"
import { permanentMediaAction, restoreMediaAction } from "@/features/trash/actions"
import { useFixedBackNavigation } from "@/hooks/use-fixed-back-navigation"
import { useServerAction } from "@/hooks/use-server-action"
import { formatDuration } from "@/lib/format"

export function TrashFolderClient({
  spaceId,
  folderId,
}: {
  spaceId: string
  folderId: string
}) {
  const { data, error, loading } = useServerAction(
    () => getTrashFolderViewAction(spaceId, folderId),
    [spaceId, folderId]
  )
  useFixedBackNavigation(`/spaces/${spaceId}/trash`)

  return (
    <MobileFrame className="ca-scroll-layout">
      <div className="ca-fixed-section">
        <TopBar
          title={data?.folder.name ?? "回收站"}
          subtitle="回收站"
          leading={
            <Link replace href={`/spaces/${spaceId}/trash`} className="ca-icon-btn" aria-label="返回">
              <ChevronLeft />
            </Link>
          }
        />
      </div>
      <div className="ca-scroll-section">
        {loading ? <LoadingState /> : null}
        {error ? <EmptyState title={error} /> : null}
        {data ? (
          data.media.length > 0 ? (
            <div className="ca-media-grid">
              {data.media.map((item) => {
                const restoreAction = restoreMediaAction.bind(null, spaceId, folderId, item.id)
                const permanentAction = permanentMediaAction.bind(null, spaceId, folderId, item.id)

                return (
                  <div key={item.id} className="ca-media">
                    <div className="absolute inset-0">
                      <MediaThumbnail src={item.url} alt={item.filename} type={item.type} sizes="50vw" />
                      {item.type === "video" ? (
                        <span className="ca-play">
                          <Play className="size-2.5 fill-white" />
                          {formatDuration(item.duration)}
                        </span>
                      ) : null}
                    </div>
                    <form action={restoreAction} className="absolute left-1 top-1 z-10">
                      <button className="grid size-5 place-items-center rounded-full bg-[#0f9f8f] text-white" aria-label="恢复">
                        <RotateCcw className="size-3" />
                      </button>
                    </form>
                    <form action={permanentAction} className="absolute right-1 top-1 z-10">
                      <button className="grid size-5 place-items-center rounded-full bg-red-500 text-white" aria-label="永久删除">
                        <Trash2 className="size-3" />
                      </button>
                    </form>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState title="这个相册没有已删除媒体" />
          )
        ) : null}
      </div>
    </MobileFrame>
  )
}
