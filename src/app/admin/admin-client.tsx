'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { Check, ChevronLeft, Copy } from 'lucide-react'
import { toast } from 'sonner'

import { ErrorBanner } from '@/components/app/error-banner'
import { useGlobalLoading } from '@/components/app/global-loading'
import { LoadingState } from '@/components/app/loading-state'
import { MobileFrame } from '@/components/app/mobile-frame'
import { PullToRefresh } from '@/components/app/pull-to-refresh'
import { TopBar } from '@/components/app/top-bar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import {
  createInviteAction,
  disableUserAction,
  revokeInviteAction,
} from '@/features/admin/actions'
import { getAdminViewAction } from '@/features/app/view-actions'
import { useFixedBackNavigation } from '@/hooks/use-fixed-back-navigation'
import { useServerAction } from '@/hooks/use-server-action'
import { formatDateTime } from '@/lib/format'

const tabs = [
  ['invites', '邀请'],
  ['users', '账号'],
] as const

type AdminTab = (typeof tabs)[number][0]

const ADMIN_TAB_STORAGE_KEY = 'cloud-album:admin-tab'

const readSavedAdminTab = (): AdminTab => {
  try {
    return window.localStorage.getItem(ADMIN_TAB_STORAGE_KEY) === 'users'
      ? 'users'
      : 'invites'
  } catch {
    return 'invites'
  }
}

const writeSavedAdminTab = (tab: AdminTab) => {
  try {
    window.localStorage.setItem(ADMIN_TAB_STORAGE_KEY, tab)
  } catch {
    // 后台 tab 偏好保存失败不影响当前页面内切换。
  }
}

const formatInviteTime = (date: Date | string | null | undefined) => {
  if (!date) {
    return '未知时间'
  }

  const value = new Date(date)
  const now = new Date()
  const showYear = value.getFullYear() !== now.getFullYear()

  return new Intl.DateTimeFormat('zh-CN', {
    ...(showYear ? { year: 'numeric' as const } : {}),
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

export function AdminClient() {
  const { hideLoading, showLoading } = useGlobalLoading()
  const {
    data,
    error: loadError,
    loading,
    refresh,
  } = useServerAction(() => getAdminViewAction(), [])
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null)
  const [copiedGeneratedInvite, setCopiedGeneratedInvite] = useState(false)
  const [generatedInvite, setGeneratedInvite] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [tab, setTab] = useState<AdminTab>(() =>
    typeof window === 'undefined' ? 'invites' : readSavedAdminTab()
  )
  useFixedBackNavigation('/spaces')

  useEffect(() => {
    writeSavedAdminTab(tab)
  }, [tab])

  const copyInviteLink = async (inviteId: string, inviteLink: string) => {
    await navigator.clipboard.writeText(inviteLink)
    setCopiedInviteId(inviteId)
    window.setTimeout(() => {
      setCopiedInviteId((currentId) =>
        currentId === inviteId ? null : currentId
      )
    }, 1400)
  }
  const copyGeneratedInviteLink = async () => {
    if (!generatedInvite) {
      return
    }

    await navigator.clipboard.writeText(generatedInvite)
    setCopiedGeneratedInvite(true)
    window.setTimeout(() => setCopiedGeneratedInvite(false), 1400)
  }
  const handleCreateInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLocalError(null)
    setGeneratedInvite(null)

    const closeLoading = showLoading({ title: '生成中', timeoutMs: 0 })

    try {
      const result = await createInviteAction(new FormData(event.currentTarget))

      if (!result.ok || !result.link) {
        setLocalError(result.error ?? '生成邀请失败')
        toast.error(result.error ?? '生成邀请失败')
        return
      }

      setGeneratedInvite(result.link)
      event.currentTarget.reset()
      await refresh()
    } finally {
      closeLoading()
      hideLoading()
    }
  }
  const handleRevokeInvite = async (inviteId: string) => {
    setLocalError(null)
    const closeLoading = showLoading({ title: '撤销中', timeoutMs: 0 })

    try {
      const result = await revokeInviteAction(inviteId)

      if (!result.ok) {
        setLocalError(result.error)
        toast.error(result.error)
        return
      }

      await refresh()
    } finally {
      closeLoading()
      hideLoading()
    }
  }
  const handleDisableUser = async (userId: string) => {
    setLocalError(null)
    const closeLoading = showLoading({ title: '禁用中', timeoutMs: 0 })

    try {
      const result = await disableUserAction(userId)

      if (!result.ok) {
        setLocalError(result.error)
        toast.error(result.error)
        return
      }

      setTab('users')
      await refresh()
    } finally {
      closeLoading()
      hideLoading()
    }
  }
  return (
    <MobileFrame className="ca-scroll-layout">
      <div className="ca-fixed-section">
        <TopBar
          title="管理后台"
          leading={
            <Link
              replace
              href="/spaces"
              className="ca-icon-btn"
              aria-label="返回空间"
            >
              <ChevronLeft />
            </Link>
          }
        />

        <div className="ca-admin-tabs">
          {tabs.map(([value, label]) => (
            <button
              key={value}
              className={`ca-chip ca-admin-tab ${tab === value ? 'active' : ''}`}
              type="button"
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <PullToRefresh onRefresh={refresh}>
        <ErrorBanner message={localError ?? loadError ?? undefined} />
        {loading ? <LoadingState /> : null}

        {data && tab === 'invites' ? (
          <div className="grid gap-3">
            <form onSubmit={handleCreateInvite} className="ca-form-stack">
              <label className="ca-field">
                <span>手机号</span>
                <Input name="phone" className="ca-input" />
              </label>
              <button className="ca-primary-btn">生成邀请链接</button>
            </form>
            {generatedInvite ? (
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-[#d5ece7] bg-[#e7f6f3] p-3 text-sm text-[#0f766e]">
                <span className="min-w-0 flex-1 break-all">
                  {generatedInvite}
                </span>
                <button
                  type="button"
                  className="grid size-8 shrink-0 place-items-center rounded-md text-[#0f9f8f]"
                  aria-label="复制邀请链接"
                  onClick={() => {
                    void copyGeneratedInviteLink()
                  }}
                >
                  {copiedGeneratedInvite ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </button>
              </div>
            ) : null}
            <div className="ca-list">
              {data.invites.map((row) => {
                const copied = copiedInviteId === row.id
                const inviteLink = row.inviteLink

                return (
                  <div key={row.id} className="ca-admin-row ca-admin-row-stack">
                    <div className="min-w-0">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <span className="min-w-0">
                          <strong>{row.phone}</strong>
                          <small>
                            {row.status === 'pending' ? '待注册' : '已注册'}
                          </small>
                        </span>
                        {row.status === 'pending' ? (
                          <button
                            type="button"
                            className="rounded-lg bg-[#fff1f1] px-2 py-1 text-[11px] text-[#c24141]"
                            onClick={() => {
                              void handleRevokeInvite(row.id)
                            }}
                          >
                            撤销
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#747b86]">
                            {formatInviteTime(row.acceptedAt ?? row.updatedAt)}
                          </span>
                        )}
                      </div>
                      {row.status === 'pending' ? (
                        inviteLink ? (
                          <div className="mt-2 flex min-w-0 items-center gap-2 rounded-lg bg-[#f7f8f8] px-2 py-1.5">
                            <span className="min-w-0 flex-1 text-[11px] leading-relaxed break-all text-[#4a5360]">
                              {inviteLink}
                            </span>
                            <button
                              type="button"
                              className="grid size-7 shrink-0 place-items-center rounded-md text-[#0f9f8f]"
                              aria-label="复制邀请链接"
                              onClick={() => {
                                void copyInviteLink(row.id, inviteLink)
                              }}
                            >
                              {copied ? (
                                <Check className="size-4" />
                              ) : (
                                <Copy className="size-4" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <small>旧邀请无法恢复链接，请撤销后重新生成</small>
                        )
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        {data && tab === 'users' ? (
          <div className="ca-list">
            {data.users.map((user) => {
              const disabled = Boolean(user.disabledAt)
              const isCurrentAdmin = user.id === data.currentAdminId

              return (
                <div key={user.id} className="ca-admin-row">
                  <span className="min-w-0">
                    <strong>{user.name}</strong>
                    <small>
                      {user.phone} ·{' '}
                      {disabled
                        ? `已禁用 · ${formatDateTime(user.disabledAt)}`
                        : formatDateTime(user.createdAt)}
                    </small>
                  </span>
                  {disabled ? (
                    <span className="rounded-lg bg-[#fff1f1] px-2 py-1 text-[11px] text-[#c24141]">
                      已禁用
                    </span>
                  ) : isCurrentAdmin ? (
                    <span className="ca-status-pill">当前账号</span>
                  ) : (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          className="rounded-lg bg-[#c24141] px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm"
                        >
                          禁用
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>禁用账号？</AlertDialogTitle>
                          <AlertDialogDescription>
                            账号将被禁用并退出登录，历史上传、删除和空间记录会保留。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="ca-confirm-footer">
                          <AlertDialogAction
                            className="ca-confirm-button ca-danger-confirm-button"
                            onClick={() => {
                              void handleDisableUser(user.id)
                            }}
                          >
                            禁用
                          </AlertDialogAction>
                          <AlertDialogCancel className="ca-confirm-button">
                            取消
                          </AlertDialogCancel>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              )
            })}
          </div>
        ) : null}
      </PullToRefresh>
    </MobileFrame>
  )
}
