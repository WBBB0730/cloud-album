import {
  AnyPgColumn,
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const inviteStatusEnum = pgEnum('invite_status', [
  'pending',
  'accepted',
  'revoked',
])

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    phone: varchar('phone', { length: 32 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    isGlobalAdmin: boolean('is_global_admin').notNull().default(false),
    lastSpaceId: uuid('last_space_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    disabledBy: uuid('disabled_by').references((): AnyPgColumn => users.id),
  },
  (table) => [uniqueIndex('users_phone_unique').on(table.phone)]
)

export const accountInvites = pgTable(
  'account_invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    phone: varchar('phone', { length: 32 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    token: text('token'),
    tokenHash: text('token_hash').notNull(),
    status: inviteStatusEnum('status').notNull().default('pending'),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id),
    acceptedUserId: uuid('accepted_user_id').references(() => users.id),
    revokedBy: uuid('revoked_by').references(() => users.id),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('account_invites_token_unique').on(table.token),
    uniqueIndex('account_invites_token_hash_unique').on(table.tokenHash),
    uniqueIndex('account_invites_pending_phone_unique')
      .on(table.phone)
      .where(sql`${table.status} = 'pending'`),
    index('account_invites_phone_idx').on(table.phone),
  ]
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.userId),
  ]
)
