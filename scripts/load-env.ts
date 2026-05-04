import { existsSync } from 'fs'
import { resolve } from 'path'

import { config } from 'dotenv'

export const loadEnv = () => {
  const nodeEnv = process.env.NODE_ENV
  const files = [
    '.env',
    '.env.local',
    nodeEnv ? `.env.${nodeEnv}` : null,
    nodeEnv ? `.env.${nodeEnv}.local` : null,
  ].filter((file): file is string => Boolean(file))

  for (const file of files) {
    const path = resolve(process.cwd(), file)

    if (existsSync(path)) {
      config({ path, override: true })
    }
  }
}
