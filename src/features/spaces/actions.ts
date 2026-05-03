"use server"

import { redirect } from "next/navigation"

import { requireUser } from "@/features/auth/session"

import { addMemberByPhone, createSpace, leaveSpace } from "./service"

const withError = (path: string, error: unknown) => {
  const message = error instanceof Error ? error.message : "操作失败"
  redirect(`${path}?error=${encodeURIComponent(message)}`)
}

export const createSpaceAction = async (formData: FormData) => {
  const user = await requireUser()
  const name = String(formData.get("name") ?? "")
  let spaceId = ""

  try {
    const space = await createSpace(user.id, name)
    spaceId = space.id
  } catch (error) {
    withError("/spaces", error)
  }

  redirect(`/spaces/${spaceId}`)
}

export const addMemberAction = async (spaceId: string, formData: FormData) => {
  const user = await requireUser()

  try {
    await addMemberByPhone(user.id, spaceId, String(formData.get("phone") ?? ""))
  } catch (error) {
    withError(`/spaces/${spaceId}`, error)
  }

  redirect(`/spaces/${spaceId}?panel=members`)
}

export const leaveSpaceAction = async (spaceId: string) => {
  const user = await requireUser()
  await leaveSpace(user.id, spaceId)
  redirect("/spaces")
}
