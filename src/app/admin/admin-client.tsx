"use client"

import Link from "next/link"
import { useState } from "react"
import { Check, ChevronLeft, Copy } from "lucide-react"

import { EmptyState } from "@/components/app/empty-state"
import { ErrorBanner } from "@/components/app/error-banner"
import { LoadingState } from "@/components/app/loading-state"
import { MobileFrame } from "@/components/app/mobile-frame"
import { TopBar } from "@/components/app/top-bar"
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
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { adminRestoreAction, createInviteAction, disableUserAction, revokeInviteAction } from "@/features/admin/actions"
import { getAdminViewAction } from "@/features/app/view-actions"
import { useServerAction } from "@/hooks/use-server-action"
import { formatDateTime } from "@/lib/format"

const tabs = [
  ["invites", "邀请"],
  ["users", "账号"],
] as const

const formatInviteTime = (date: Date | string | null | undefined) => {
  if (!date) {
    return "未知时间"
  }

  const value = new Date(date)
  const now = new Date()
  const showYear = value.getFullYear() !== now.getFullYear()

  return new Intl.DateTimeFormat("zh-CN", {
    ...(showYear ? { year: "numeric" as const } : {}),
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value)
}

export function AdminClient({
  tab,
  error,
  invite,
}: {
  tab: string
  error?: string
  invite?: string
}) {
  const { data, error: loadError, loading } = useServerAction(() => getAdminViewAction(), [])
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null)

  const copyInviteLink = async (inviteId: string, inviteLink: string) => {
    await navigator.clipboard.writeText(inviteLink)
    setCopiedInviteId(inviteId)
    window.setTimeout(() => {
      setCopiedInviteId((currentId) => (currentId === inviteId ? null : currentId))
    }, 1400)
  }

  return (
    <MobileFrame className="ca-scroll-layout">
      <div className="ca-fixed-section">
        <TopBar
          title="管理后台"
          leading={
            <Link href="/spaces" className="ca-icon-btn" aria-label="返回空间">
              <ChevronLeft />
            </Link>
          }
        />

        <div className="ca-admin-tabs">
          {tabs.map(([value, label]) => (
            <Link key={value} href={`/admin?tab=${value}`} className={`ca-chip ca-admin-tab ${tab === value ? "active" : ""}`}>{label}</Link>
          ))}
        </div>
      </div>

      <div className="ca-scroll-section">
        <ErrorBanner message={error ?? loadError ?? undefined} />
        {loading ? <LoadingState /> : null}

        {data && tab === "invites" ? (
          <div className="grid gap-3">
            <form action={createInviteAction} className="ca-form-stack">
              <label className="ca-field">
                <span>手机号</span>
                <Input name="phone" className="ca-input" />
              </label>
              <button className="ca-primary-btn">生成邀请链接</button>
            </form>
            {invite ? (
              <div className="break-all rounded-lg border border-[#d5ece7] bg-[#e7f6f3] p-3 text-sm text-[#0f766e]">
                {invite}
              </div>
            ) : null}
            <div className="ca-list">
              {data.invites.map((row) => {
                const revokeAction = revokeInviteAction.bind(null, row.id)
                const copied = copiedInviteId === row.id
                const inviteLink = row.inviteLink

                return (
                  <div key={row.id} className="ca-admin-row ca-admin-row-stack">
                    <div className="min-w-0">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <span className="min-w-0">
                          <strong>{row.phone}</strong>
                          <small>{row.status === "pending" ? "待注册" : "已注册"}</small>
                        </span>
                        {row.status === "pending" ? (
                          <form action={revokeAction}>
                            <button className="rounded-lg bg-[#fff1f1] px-2 py-1 text-[11px] text-[#c24141]">撤销</button>
                          </form>
                        ) : (
                          <span className="text-[11px] text-[#747b86]">
                            {formatInviteTime(row.acceptedAt ?? row.updatedAt)}
                          </span>
                        )}
                      </div>
                      {row.status === "pending" ? (
                        inviteLink ? (
                          <div className="mt-2 flex min-w-0 items-center gap-2 rounded-lg bg-[#f7f8f8] px-2 py-1.5">
                            <span className="min-w-0 flex-1 break-all text-[11px] leading-relaxed text-[#4a5360]">
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
                              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
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

        {data && tab === "users" ? (
          <div className="ca-list">
            {data.users.map((user) => {
              const disableAction = disableUserAction.bind(null, user.id)
              const disabled = Boolean(user.disabledAt)
              const isCurrentAdmin = user.id === data.currentAdminId

              return (
                <div key={user.id} className="ca-admin-row">
                  <span className="min-w-0">
                    <strong>{user.name}</strong>
                    <small>
                      {user.phone} · {user.isGlobalAdmin ? "全局管理员" : "普通用户"} · {disabled ? `已禁用 · ${formatDateTime(user.disabledAt)}` : formatDateTime(user.createdAt)}
                    </small>
                  </span>
                  {disabled ? (
                    <span className="rounded-lg bg-[#fff1f1] px-2 py-1 text-[11px] text-[#c24141]">已禁用</span>
                  ) : isCurrentAdmin ? (
                    <span className="ca-status-pill">当前账号</span>
                  ) : (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button type="button" className="rounded-lg bg-[#c24141] px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm">
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
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <form action={disableAction}>
                            <AlertDialogAction type="submit" className="ca-danger-confirm-button">
                              禁用
                            </AlertDialogAction>
                          </form>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              )
            })}
          </div>
        ) : null}

        {data && tab === "deleted" ? (
          <div className="ca-list">
            {data.permanentRecords.length === 0 ? <EmptyState title="暂无永久删除记录" /> : null}
            {data.permanentRecords.map((record) => {
              const restoreAction = adminRestoreAction.bind(null, record.recordType, record.id)

              return (
                <div key={`${record.recordType}-${record.id}`} className="ca-admin-row">
                  <div className="min-w-0">
                    <strong>{record.name}</strong>
                    <small>{record.kind} · {formatDateTime(record.permanentlyDeletedAt)}</small>
                  </div>
                  <form action={restoreAction}>
                    <button className="rounded-lg bg-[#e7f6f3] px-2 py-1 text-[11px] text-[#0f9f8f]">后台恢复</button>
                  </form>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </MobileFrame>
  )
}
