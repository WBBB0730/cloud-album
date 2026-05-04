"use server"

import { getAdminDashboard } from "@/features/admin/service"
import { getAlbumHome, getFolderDetail, getMediaPreview } from "@/features/albums/service"
import { getInviteForToken } from "@/features/auth/service"
import { getCurrentUser, requireAdmin, requireUser } from "@/features/auth/session"
import { getSpaceMembers, getSpacesForUser, requireSpaceMember } from "@/features/spaces/service"
import { getTrashFolder, getTrashHome } from "@/features/trash/service"

export const getRootDestinationAction = async () => {
  const user = await getCurrentUser()

  if (!user) {
    return "/login"
  }

  return "/spaces"
}

export const getInviteViewAction = async (token: string) => {
  const invite = await getInviteForToken(token)

  return invite
    ? {
        phone: invite.phone,
      }
    : null
}

export const getSpacesViewAction = async () => {
  const user = await requireUser()
  const spaces = await getSpacesForUser(user.id)

  return {
    user: {
      id: user.id,
      name: user.name,
      isGlobalAdmin: user.isGlobalAdmin,
    },
    spaces,
  }
}

export const getSpaceViewAction = async (spaceId: string) => {
  const user = await requireUser()
  return getAlbumHome(spaceId, user.id)
}

export const getSpaceMembersViewAction = async (spaceId: string) => {
  const user = await requireUser()
  return getSpaceMembers(spaceId, user.id)
}

export const getNewFolderViewAction = async (spaceId: string) => {
  const user = await requireUser()
  const space = await requireSpaceMember(spaceId, user.id)

  return {
    space: {
      id: space.id,
      name: space.name,
    },
  }
}

export const getFolderViewAction = async (
  spaceId: string,
  folderId: string
) => {
  const user = await requireUser()
  return getFolderDetail(spaceId, folderId, user.id)
}

export const getMediaPreviewViewAction = async (
  spaceId: string,
  folderId: string,
  mediaId: string
) => {
  const user = await requireUser()
  return getMediaPreview(spaceId, folderId, mediaId, user.id)
}

export const getTrashHomeViewAction = async (spaceId: string) => {
  const user = await requireUser()
  return getTrashHome(spaceId, user.id)
}

export const getTrashFolderViewAction = async (spaceId: string, folderId: string) => {
  const user = await requireUser()
  return getTrashFolder(spaceId, folderId, user.id)
}

export const getAdminViewAction = async () => {
  const admin = await requireAdmin()
  return getAdminDashboard(admin.id)
}
