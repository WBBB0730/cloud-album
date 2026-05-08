import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { resolve } from 'path'

import COS from 'cos-js-sdk-v5'
import { config } from 'dotenv'
import pg from 'pg'

const { Pool } = pg

type BackfillOptions = {
  backfill: boolean
  limit: number
  concurrency: number
  spaceId: string | null
  folderId: string | null
}

type RuntimeEnv = {
  tencentSecretId: string
  tencentSecretKey: string
  cosBucket: string
  cosRegion: string
  cosSignedUrlExpiresSeconds: number
}

type MediaRow = {
  id: string
  spaceId: string
  folderId: string
  filename: string
  cosKey: string
  size: number
}

type BackfillState = {
  options: BackfillOptions
  env: RuntimeEnv
  pool: pg.Pool
  cos: InstanceType<typeof COS>
  queue: MediaRow[]
  updated: number
  skipped: number
  failed: number
}

const loadEnv = () => {
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

const required = (name: string) => {
  const value = process.env[name]

  if (!value) {
    throw new Error(`缺少环境变量 ${name}`)
  }

  return value
}

const optionalNumber = (name: string, fallback: number) => {
  const value = process.env[name]

  if (!value) {
    return fallback
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const numberArg = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const parseArgs = (): BackfillOptions => {
  const args = new Map<string, string | true>()

  for (const arg of process.argv.slice(2)) {
    if (arg === '--backfill') {
      args.set('backfill', true)
      continue
    }

    const match = arg.match(/^--([^=]+)=(.*)$/)

    if (match) {
      args.set(match[1], match[2])
    }
  }

  const limit = numberArg(args.get('limit') as string | undefined, 0)
  const concurrency = numberArg(
    args.get('concurrency') as string | undefined,
    2
  )

  return {
    backfill: args.get('backfill') === true,
    limit: Math.max(0, Math.floor(limit)),
    concurrency: Math.max(1, Math.floor(concurrency)),
    spaceId: (args.get('space') as string | undefined) || null,
    folderId: (args.get('folder') as string | undefined) || null,
  }
}

const printStats = async (pool: pg.Pool) => {
  const mediaStats = await pool.query<{
    total: number
    hashed: number
    missing: number
  }>(
    `
      SELECT
        count(*)::int AS "total",
        count("content_hash")::int AS "hashed",
        count(*) FILTER (WHERE "content_hash" IS NULL)::int AS "missing"
      FROM "media"
      WHERE "status" = 'ready'
        AND "deleted_at" IS NULL
        AND "permanently_deleted_at" IS NULL
    `
  )
  const duplicateStats = await pool.query<{ duplicateGroups: number }>(
    `
      SELECT count(*)::int AS "duplicateGroups"
      FROM (
        SELECT "space_id", "folder_id", "content_hash"
        FROM "media"
        WHERE "status" = 'ready'
          AND "deleted_at" IS NULL
          AND "permanently_deleted_at" IS NULL
          AND "content_hash" IS NOT NULL
        GROUP BY "space_id", "folder_id", "content_hash"
        HAVING count(*) > 1
      ) AS "duplicates"
    `
  )
  const sessionStats = await pool.query<{
    total: number
    hashed: number
    missing: number
  }>(
    `
      SELECT
        count(*)::int AS "total",
        count("upload_sessions"."content_hash")::int AS "hashed",
        count(*) FILTER (
          WHERE "upload_sessions"."content_hash" IS NULL
        )::int AS "missing"
      FROM "upload_sessions"
      JOIN "media" ON "media"."id" = "upload_sessions"."media_id"
      WHERE "media"."status" = 'ready'
        AND "media"."deleted_at" IS NULL
        AND "media"."permanently_deleted_at" IS NULL
        AND "media"."content_hash" IS NOT NULL
    `
  )

  const media = mediaStats.rows[0]
  const sessions = sessionStats.rows[0]

  console.log(`媒体总数：${media.total}`)
  console.log(`已回填：${media.hashed}`)
  console.log(`待回填：${media.missing}`)
  console.log(`重复组：${duplicateStats.rows[0].duplicateGroups}`)
  console.log(
    `上传记录同步：${sessions.hashed}/${sessions.total}，缺失 ${sessions.missing}`
  )
}

const normalizeCosKey = (cosKey: string) => cosKey.replace(/^\/+/, '')

const createSignedReadUrl = (
  cos: InstanceType<typeof COS>,
  env: RuntimeEnv,
  cosKey: string
) =>
  cos.getObjectUrl(
    {
      Bucket: env.cosBucket,
      Region: env.cosRegion,
      Key: normalizeCosKey(cosKey),
      Method: 'GET',
      Expires: env.cosSignedUrlExpiresSeconds,
      Sign: true,
    },
    () => {}
  )

const hashRemoteObject = async (url: string) => {
  const response = await fetch(url)

  if (!response.ok || !response.body) {
    throw new Error(`COS 读取失败：${response.status} ${response.statusText}`)
  }

  const hash = createHash('sha256')
  const reader = response.body.getReader()

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    hash.update(value)
  }

  return hash.digest('hex')
}

const fetchNextMedia = async (pool: pg.Pool, options: BackfillOptions) => {
  const values: string[] = []
  const filters = [
    `"status" = 'ready'`,
    `"deleted_at" IS NULL`,
    `"permanently_deleted_at" IS NULL`,
    `"content_hash" IS NULL`,
  ]

  if (options.spaceId) {
    values.push(options.spaceId)
    filters.push(`"space_id" = $${values.length}`)
  }

  if (options.folderId) {
    values.push(options.folderId)
    filters.push(`"folder_id" = $${values.length}`)
  }

  const limitSql =
    options.limit > 0 ? `LIMIT ${Math.max(1, options.limit)}` : ''

  const result = await pool.query<MediaRow>(
    `
      SELECT
        "id",
        "space_id" AS "spaceId",
        "folder_id" AS "folderId",
        "filename",
        "cos_key" AS "cosKey",
        "size"
      FROM "media"
      WHERE ${filters.join(' AND ')}
      ORDER BY "created_at" ASC, "id" ASC
      ${limitSql}
    `,
    values
  )

  return result.rows
}

const updateContentHash = async (
  pool: pg.Pool,
  item: MediaRow,
  contentHash: string
) => {
  await pool.query('BEGIN')

  try {
    const mediaResult = await pool.query(
      `
        UPDATE "media"
        SET "content_hash" = $1, "updated_at" = NOW()
        WHERE "id" = $2
          AND "content_hash" IS NULL
      `,
      [contentHash, item.id]
    )

    if (mediaResult.rowCount !== null && mediaResult.rowCount > 0) {
      await pool.query(
        `
          UPDATE "upload_sessions"
          SET "content_hash" = $1, "updated_at" = NOW()
          WHERE "media_id" = $2
            AND "content_hash" IS NULL
        `,
        [contentHash, item.id]
      )
    }

    await pool.query('COMMIT')
    return mediaResult.rowCount !== null && mediaResult.rowCount > 0
  } catch (error) {
    await pool.query('ROLLBACK')
    throw error
  }
}

const createWorker = async (state: BackfillState, workerId: number) => {
  while (state.queue.length > 0) {
    const item = state.queue.shift()

    if (!item) {
      continue
    }

    try {
      const url = createSignedReadUrl(state.cos, state.env, item.cosKey)
      const contentHash = await hashRemoteObject(url)
      const updated = await updateContentHash(state.pool, item, contentHash)

      if (updated) {
        state.updated += 1
        console.log(
          `[${workerId}] updated ${item.id} ${item.filename} ${contentHash}`
        )
      } else {
        state.skipped += 1
        console.log(
          `[${workerId}] skip unchanged ${item.id} ${item.filename} ${contentHash}`
        )
      }
    } catch (error) {
      state.failed += 1
      console.error(
        `[${workerId}] failed ${item.id} ${item.filename}:`,
        error instanceof Error ? error.message : error
      )
    }
  }
}

const main = async () => {
  loadEnv()

  const options = parseArgs()
  const pool = new Pool({
    connectionString: required('DATABASE_URL'),
  })

  if (!options.backfill) {
    try {
      await printStats(pool)
    } finally {
      await pool.end()
    }

    return
  }

  const env: RuntimeEnv = {
    tencentSecretId: required('TENCENT_CLOUD_SECRET_ID'),
    tencentSecretKey: required('TENCENT_CLOUD_SECRET_KEY'),
    cosBucket: required('COS_BUCKET'),
    cosRegion: required('COS_REGION'),
    cosSignedUrlExpiresSeconds: optionalNumber(
      'COS_SIGNED_URL_EXPIRES_SECONDS',
      900
    ),
  }

  const cos = new COS({
    SecretId: env.tencentSecretId,
    SecretKey: env.tencentSecretKey,
  })

  try {
    const queue = await fetchNextMedia(pool, options)
    const state: BackfillState = {
      options,
      env,
      pool,
      cos,
      queue,
      updated: 0,
      skipped: 0,
      failed: 0,
    }

    console.log(
      [
        'mode=write',
        `count=${queue.length}`,
        `concurrency=${options.concurrency}`,
        options.limit > 0 ? `limit=${options.limit}` : null,
        options.spaceId ? `space=${options.spaceId}` : null,
        options.folderId ? `folder=${options.folderId}` : null,
      ]
        .filter(Boolean)
        .join(' ')
    )

    await Promise.all(
      Array.from({ length: options.concurrency }, (_, index) =>
        createWorker(state, index + 1)
      )
    )

    console.log(
      `done updated=${state.updated} skipped=${state.skipped} failed=${state.failed}`
    )

    if (state.failed > 0) {
      process.exitCode = 1
    }
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
