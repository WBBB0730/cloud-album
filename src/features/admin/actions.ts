"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireAdmin } from "@/features/auth/session"

import { adminRestorePermanentRecord, createInvite, revokeInvite } from "./service"

const withError = (path: string, error: unknown) => {
  const message = error instanceof Error ? error.message : "操作失败"
  redirect(`${path}?error=${encodeURIComponent(message)}`)
}

export const createInviteAction = async (formData: FormData) => {
  const admin = await requireAdmin()
  let link = ""

  try {
    link = await createInvite(
      admin.id,
      String(formData.get("phone") ?? "")
    )
  } catch (error) {
    withError("/admin", error)
  }

  revalidatePath("/admin")
  redirect(`/admin?invite=${encodeURIComponent(link)}`)
}

export const revokeInviteAction = async (inviteId: string) => {
  const admin = await requireAdmin()
  await revokeInvite(admin.id, inviteId)
  revalidatePath("/admin")
  redirect("/admin")
}

export const adminRestoreAction = async (kind: "media" | "folder", recordId: string) => {
  await requireAdmin()
  await adminRestorePermanentRecord(kind, recordId)
  revalidatePath("/admin")
  redirect("/admin")
}
