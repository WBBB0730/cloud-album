'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ChevronRight, HousePlus, LogOut, Settings } from 'lucide-react'

import { EmptyState } from '@/components/app/empty-state'
import { useGlobalLoading } from '@/components/app/global-loading'
import { LoadingState } from '@/components/app/loading-state'
import { MobileFrame } from '@/components/app/mobile-frame'
import { NameEditDialog } from '@/components/app/name-edit-dialog'
import { PullToRefresh } from '@/components/app/pull-to-refresh'
import { TopBar } from '@/components/app/top-bar'
import { getSpacesViewAction } from '@/features/app/view-actions'
import { logoutAction } from '@/features/auth/actions'
import { createSpaceAction } from '@/features/spaces/actions'
import {
  clearServerActionCache,
  useServerAction,
} from '@/hooks/use-server-action'
import {
  hasArrayField,
  hasStringField,
  isRecord,
} from '@/lib/cache-validation'

type SpacesViewData = Awaited<ReturnType<typeof getSpacesViewAction>>

const isSpacesViewData = (value: unknown): value is SpacesViewData => {
  if (!isRecord(value)) {
    return false
  }

  const user = value.user

  return (
    isRecord(user) &&
    hasStringField(user, 'id') &&
    hasStringField(user, 'name') &&
    hasArrayField(value, 'spaces')
  )
}

export function SpacesClient() {
  const router = useRouter()
  const { showLoading } = useGlobalLoading()
  const [createOpen, setCreateOpen] = useState(false)
  const { data, error, loading, refresh } = useServerAction(
    () => getSpacesViewAction(),
    [],
    {
      cacheVersion: 'spaces-view:v1',
      validateCacheData: isSpacesViewData,
    }
  )

  const handleLogout = async () => {
    const hideLoading = showLoading({ title: '退出中', timeoutMs: 0 })

    try {
      await logoutAction()
      clearServerActionCache()
      router.replace('/login')
      router.refresh()
    } finally {
      hideLoading()
    }
  }

  const handleCreateSpace = async (name: string) => {
    const hideLoading = showLoading({ title: '创建中', timeoutMs: 0 })
    const formData = new FormData()
    formData.set('name', name)

    try {
      const result = await createSpaceAction(formData)

      if (!result.ok || !result.spaceId) {
        return result.error ?? '创建空间失败'
      }

      clearServerActionCache()
      router.replace(`/spaces/${result.spaceId}`)
      return null
    } finally {
      hideLoading()
    }
  }

  return (
    <MobileFrame className="ca-scroll-layout">
      <div className="ca-fixed-section">
        <TopBar
          title="选择空间"
          actions={
            <>
              {data?.user.isGlobalAdmin ? (
                <Link
                  href="/admin"
                  className="ca-icon-btn"
                  aria-label="管理后台"
                >
                  <Settings />
                </Link>
              ) : null}
              <button
                type="button"
                className="ca-icon-btn"
                aria-label="新建空间"
                onClick={() => setCreateOpen(true)}
              >
                <HousePlus />
              </button>
              <button
                type="button"
                className="ca-icon-btn"
                aria-label="退出登录"
                onClick={() => {
                  void handleLogout()
                }}
              >
                <LogOut />
              </button>
            </>
          }
        />
      </div>

      <PullToRefresh onRefresh={refresh}>
        {loading ? <LoadingState /> : null}
        {error ? <EmptyState title={error} /> : null}

        {data ? (
          <div className="ca-list">
            {data.spaces.length > 0 ? (
              data.spaces.map((space) => {
                return (
                  <Link
                    key={space.id}
                    href={`/spaces/${space.id}`}
                    className="ca-space-row w-full text-left"
                  >
                    <span className="ca-space-avatar">
                      {space.name.slice(0, 1)}
                    </span>
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
              <EmptyState title="还没有空间">
                创建一个空间后，就可以邀请家人一起整理照片。
              </EmptyState>
            )}
          </div>
        ) : null}
      </PullToRefresh>

      <NameEditDialog
        initialName="我的空间"
        label="空间名称"
        open={createOpen}
        pendingLabel="创建中"
        submitLabel="创建"
        title="新建空间"
        onOpenChange={setCreateOpen}
        onSubmit={handleCreateSpace}
      />
    </MobileFrame>
  )
}
