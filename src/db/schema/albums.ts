import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import { users } from './auth'
import { deleteBatches } from './deletes'
import { spaces } from './spaces'

export const mediaTypeEnum = pgEnum('media_type', ['image', 'video'])
export const mediaStatusEnum = pgEnum('media_status', [
  'pending',
  'uploading',
  'ready',
  'failed',
])

export const folders = pgTable(
  'folders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id),
    name: varchar('name', { length: 120 }).notNull(),
    coverMediaId: uuid('cover_media_id'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: uuid('deleted_by').references(() => users.id),
    permanentlyDeletedAt: timestamp('permanently_deleted_at', {
      withTimezone: true,
    }),
    permanentlyDeletedBy: uuid('permanently_deleted_by').references(
      () => users.id
    ),
    deleteBatchId: uuid('delete_batch_id').references(() => deleteBatches.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('folders_space_deleted_idx').on(table.spaceId, table.deletedAt),
    index('folders_delete_batch_idx').on(table.deleteBatchId),
  ]
)

export const media = pgTable(
  'media',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id),
    folderId: uuid('folder_id')
      .notNull()
      .references(() => folders.id),
    type: mediaTypeEnum('type').notNull(),
    filename: varchar('filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    contentHash: varchar('content_hash', { length: 64 }),
    cosKey: text('cos_key').notNull(),
    width: integer('width'),
    height: integer('height'),
    duration: integer('duration'),
    takenAt: timestamp('taken_at', { withTimezone: true }).notNull(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    status: mediaStatusEnum('status').notNull().default('pending'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: uuid('deleted_by').references(() => users.id),
    permanentlyDeletedAt: timestamp('permanently_deleted_at', {
      withTimezone: true,
    }),
    permanentlyDeletedBy: uuid('permanently_deleted_by').references(
      () => users.id
    ),
    deleteBatchId: uuid('delete_batch_id').references(() => deleteBatches.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('media_space_folder_taken_idx').on(
      table.spaceId,
      table.folderId,
      table.takenAt
    ),
    index('media_space_deleted_idx').on(table.spaceId, table.deletedAt),
    index('media_space_permanent_idx').on(
      table.spaceId,
      table.permanentlyDeletedAt
    ),
    index('media_delete_batch_idx').on(table.deleteBatchId),
    index('media_album_content_hash_idx')
      .on(table.spaceId, table.folderId, table.contentHash)
      .where(
        sql`${table.contentHash} IS NOT NULL AND ${table.status} = 'ready' AND ${table.deletedAt} IS NULL AND ${table.permanentlyDeletedAt} IS NULL`
      ),
    index('media_album_cos_key_idx')
      .on(table.spaceId, table.folderId, table.cosKey)
      .where(
        sql`${table.status} = 'ready' AND ${table.deletedAt} IS NULL AND ${table.permanentlyDeletedAt} IS NULL`
      ),
    index('media_cos_key_idx').on(table.cosKey),
  ]
)
