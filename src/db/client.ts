import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { env } from "@/lib/env"

import * as schema from "./schema"

const globalForDb = globalThis as unknown as {
  cloudAlbumPool?: Pool
}

export const pool =
  globalForDb.cloudAlbumPool ??
  new Pool({
    connectionString: env.databaseUrl,
  })

if (process.env.NODE_ENV !== "production") {
  globalForDb.cloudAlbumPool = pool
}

export const db = drizzle(pool, { schema })
