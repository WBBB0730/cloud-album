import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { users } from "./auth"
import { spaces } from "./spaces"

export const deleteBatches = pgTable(
  "delete_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    deletedBy: uuid("deleted_by")
      .notNull()
      .references(() => users.id),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("delete_batches_space_id_idx").on(table.spaceId),
    index("delete_batches_deleted_by_idx").on(table.deletedBy),
  ]
)
