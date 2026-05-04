"use client"

import Link from "next/link"
import { ChevronLeft } from "lucide-react"

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
import { getSpaceMembersViewAction } from "@/features/app/view-actions"
import { addMemberAction, leaveSpaceAction, removeMemberAction } from "@/features/spaces/actions"
import { useServerAction } from "@/hooks/use-server-action"
import { formatDateTime } from "@/lib/format"

export function MembersClient({
  spaceId,
  error: inviteError,
}: {
  spaceId: string
  error?: string
}) {
  const { data, error: loadError, loading } = useServerAction(
    () => getSpaceMembersViewAction(spaceId),
    [spaceId]
  )
  const inviteAction = addMemberAction.bind(null, spaceId)
  const leaveAction = leaveSpaceAction.bind(null, spaceId)
  const currentUser = data?.members.find((member) => member.userId === data.currentUserId)
  const currentUserIsCreator = data?.space.createdBy === data?.currentUserId

  return (
    <MobileFrame className="ca-scroll-layout">
      <div className="ca-fixed-section">
        <TopBar
          title="成员管理"
          subtitle={data?.space.name}
          leading={
            <Link href={`/spaces/${spaceId}`} className="ca-icon-btn" aria-label="返回空间">
              <ChevronLeft />
            </Link>
          }
        />
      </div>

      <div className="ca-scroll-section">
        <div className="grid gap-4">
          <ErrorBanner message={inviteError ?? undefined} />
          <form action={inviteAction} className="ca-form-stack">
            <label className="ca-field">
              <span>手机号</span>
              <Input name="phone" className="ca-input" inputMode="tel" />
            </label>
            <button className="ca-primary-btn">邀请加入空间</button>
          </form>

          {loading ? (
            <LoadingState />
          ) : loadError ? (
            <EmptyState title={loadError} />
          ) : data ? (
            data.members.length === 0 ? (
              <EmptyState title="还没有成员" />
            ) : (
              <div className="ca-list">
                {data.members.map((member) => {
                  const isSelf = member.userId === data.currentUserId
                  const canRemoveMember =
                    data.space.createdBy === data.currentUserId &&
                    member.userId !== data.space.createdBy &&
                    !isSelf
                  const removeAction = removeMemberAction.bind(null, spaceId, member.userId)

                  return (
                    <div key={member.id} className="ca-member-row">
                      <span className="ca-space-avatar">{member.name.slice(0, 1)}</span>
                      <span className="min-w-0">
                        <strong>{member.name}</strong>
                        <small>
                          {member.phone} · {member.userId === data.space.createdBy ? "创建者" : member.isGlobalAdmin ? "全局管理员" : "成员"} · {formatDateTime(member.joinedAt)}
                        </small>
                      </span>
                      {canRemoveMember ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button type="button" className="ca-member-action danger">
                              移除
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>移除 {member.name}？</AlertDialogTitle>
                              <AlertDialogDescription>
                                移除后，对方将无法继续访问这个空间内的相册和媒体。
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="ca-confirm-footer">
                              <form action={removeAction} className="ca-confirm-form">
                                <AlertDialogAction
                                  type="submit"
                                  className="ca-confirm-button bg-[#c24141] text-white hover:bg-[#b33333]"
                                >
                                  移除
                                </AlertDialogAction>
                              </form>
                              <AlertDialogCancel className="ca-confirm-button">取消</AlertDialogCancel>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )
          ) : null}

          {data && currentUser && !currentUserIsCreator ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button type="button" className="ca-leave-space-btn">
                  退出空间
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>退出这个空间？</AlertDialogTitle>
                  <AlertDialogDescription>
                    退出后将无法继续访问这个空间内的相册和媒体。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="ca-confirm-footer">
                  <form action={leaveAction} className="ca-confirm-form">
                    <AlertDialogAction
                      type="submit"
                      className="ca-confirm-button bg-[#c24141] text-white hover:bg-[#b33333]"
                    >
                      退出
                    </AlertDialogAction>
                  </form>
                  <AlertDialogCancel className="ca-confirm-button">取消</AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>
    </MobileFrame>
  )
}
