import { defineConfig } from 'drizzle-kit'

import { loadEnv } from './scripts/load-env'

loadEnv()

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
})
