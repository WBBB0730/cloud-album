import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { media, uploadSessions } from '@/db/schema'
import { getFolderById } from '@/features/albums/queries'
import { requireSpaceMember } from '@/features/spaces/service'
import { createCosKey, getUploadCredential } from '@/lib/cos'
import { env } from '@/lib/env'

type CreateUploadInput = {
  spaceId: string
  folderId: string
  filename: string
  mimeType: string
  size: number
  width?: number | null
  height?: number | null
  duration?: number | null
  takenAt?: string | null
}

export const createUploadIntent = async (
  userId: string,
  input: CreateUploadInput
) => {
  const [, folder] = await Promise.all([
    requireSpaceMember(input.spaceId, userId),
    getFolderById(input.spaceId, input.folderId),
  ])

  if (!folder || folder.deletedAt || folder.permanentlyDeletedAt) {
    throw new Error('相册不存在')
  }

  const type = input.mimeType.startsWith('video/') ? 'video' : 'image'
  const cosKey = createCosKey(input.spaceId, input.folderId, input.filename)
  const takenAt = input.takenAt ? new Date(input.takenAt) : new Date()

  const result = await db.transaction(async (tx) => {
    const [createdMedia] = await tx
      .insert(media)
      .values({
        spaceId: input.spaceId,
        folderId: input.folderId,
        type,
        filename: input.filename,
        mimeType: input.mimeType || 'application/octet-stream',
        size: input.size,
        cosKey,
        width: input.width ?? null,
        height: input.height ?? null,
        duration: input.duration ? Math.round(input.duration) : null,
        takenAt: Number.isNaN(takenAt.getTime()) ? new Date() : takenAt,
        uploadedBy: userId,
        status: 'uploading',
      })
      .returning()

    const [session] = await tx
      .insert(uploadSessions)
      .values({
        spaceId: input.spaceId,
        folderId: input.folderId,
        mediaId: createdMedia.id,
        cosKey,
        filename: input.filename,
        mimeType: input.mimeType || 'application/octet-stream',
        size: input.size,
        status: 'uploading',
        uploadedBy: userId,
      })
      .returning()

    return { media: createdMedia, session }
  })

  const credential = await getUploadCredential(cosKey)

  return {
    ...result,
    upload: {
      region: env.cosRegion,
      bucket: env.cosBucket,
      key: cosKey,
      credential,
    },
  }
}

export const confirmUploadComplete = async (
  userId: string,
  spaceId: string,
  sessionId: string
) => {
  const [, [session]] = await Promise.all([
    requireSpaceMember(spaceId, userId),
    db
      .select()
      .from(uploadSessions)
      .where(
        and(
          eq(uploadSessions.id, sessionId),
          eq(uploadSessions.spaceId, spaceId),
          eq(uploadSessions.uploadedBy, userId)
        )
      )
      .limit(1),
  ])

  if (!session) {
    throw new Error('上传记录不存在')
  }

  await db.transaction(async (tx) => {
    await tx
      .update(uploadSessions)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(uploadSessions.id, session.id))
    await tx
      .update(media)
      .set({ status: 'ready', updatedAt: new Date() })
      .where(eq(media.id, session.mediaId))
  })
}

export const markUploadFailed = async (
  userId: string,
  spaceId: string,
  sessionId: string
) => {
  const [, [session]] = await Promise.all([
    requireSpaceMember(spaceId, userId),
    db
      .select()
      .from(uploadSessions)
      .where(
        and(
          eq(uploadSessions.id, sessionId),
          eq(uploadSessions.spaceId, spaceId),
          eq(uploadSessions.uploadedBy, userId)
        )
      )
      .limit(1),
  ])

  if (!session) {
    return
  }

  await db.transaction(async (tx) => {
    await tx
      .update(uploadSessions)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(uploadSessions.id, session.id))
    await tx
      .update(media)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(media.id, session.mediaId))
  })
}
