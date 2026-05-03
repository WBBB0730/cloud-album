"use client"

import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { EmptyState } from "@/components/app/empty-state"
import { ErrorBanner } from "@/components/app/error-banner"
import { LoadingState } from "@/components/app/loading-state"
import { MobileFrame } from "@/components/app/mobile-frame"
import { TopBar } from "@/components/app/top-bar"
import { Input } from "@/components/ui/input"
import { adminRestoreAction, createInviteAction, revokeInviteAction } from "@/features/admin/actions"
import { getAdminViewAction } from "@/features/app/view-actions"
import { useServerAction } from "@/hooks/use-server-action"
import { formatDateTime } from "@/lib/format"

const tabs = [
  ["invites", "邀请"],
  ["users", "账号"],
  ["spaces", "空间"],
] as const

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

        <div className="mb-3 flex gap-1 overflow-x-auto">
          {tabs.map(([value, label]) => (
            <Link key={value} href={`/admin?tab=${value}`} className={`ca-chip shrink-0 border border-[#e6e8eb] ${tab === value ? "active" : ""}`}>{label}</Link>
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

                return (
                  <div key={row.id} className="ca-admin-row">
                    <div className="min-w-0">
                      <strong>{row.phone}</strong>
                      <small>{row.status === "pending" ? "待注册" : row.status === "accepted" ? "已注册" : "已撤销"}</small>
                    </div>
                    {row.status === "pending" ? (
                      <form action={revokeAction}>
                        <button className="rounded-lg bg-[#fff1f1] px-2 py-1 text-[11px] text-[#c24141]">撤销</button>
                      </form>
                    ) : (
                      <span className="ca-status-pill">{row.status === "accepted" ? "已注册" : "已撤销"}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        {data && tab === "users" ? (
          <div className="ca-list">
            {data.users.map((user) => (
              <div key={user.id} className="ca-admin-row">
                <span className="min-w-0">
                  <strong>{user.name}</strong>
                  <small>{user.phone} · {user.isGlobalAdmin ? "全局管理员" : "普通用户"} · {formatDateTime(user.createdAt)}</small>
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {data && tab === "spaces" ? (
          <div className="ca-list">
            {data.spaces.map((space) => (
              <div key={space.id} className="ca-admin-row">
                <span className="min-w-0">
                  <strong>{space.name}</strong>
                  <small>创建于 {formatDateTime(space.createdAt)}</small>
                </span>
              </div>
            ))}
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
