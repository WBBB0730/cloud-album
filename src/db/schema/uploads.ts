import {
  bigint,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { users } from './auth'
import { media } from './albums'
import { folders } from './albums'
import { spaces } from './spaces'

export const uploadStatusEnum = pgEnum('upload_status', [
  'pending',
  'uploading',
  'completed',
  'failed',
])

export const uploadSessions = pgTable(
  'upload_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id),
    folderId: uuid('folder_id')
      .notNull()
      .references(() => folders.id),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id),
    uploadId: text('upload_id'),
    cosKey: text('cos_key').notNull(),
    filename: varchar('filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    status: uploadStatusEnum('status').notNull().default('pending'),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('upload_sessions_space_folder_idx').on(table.spaceId, table.folderId),
    index('upload_sessions_media_id_idx').on(table.mediaId),
  ]
)
