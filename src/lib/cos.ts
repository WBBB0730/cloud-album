import 'server-only'

import { randomUUID } from 'crypto'
import COS from 'cos-js-sdk-v5'

import { env } from '@/lib/env'

type TemporaryCredential = {
  credentials: {
    tmpSecretId: string
    tmpSecretKey: string
    sessionToken: string
  }
  startTime: number
  expiredTime: number
}

type CosQueryValue = string | number | boolean | null | undefined
type CosQuery = Record<string, CosQueryValue>
type CosClient = InstanceType<typeof COS>

const UPLOAD_ACTIONS = [
  'name/cos:PutObject',
  'name/cos:PostObject',
  'name/cos:InitiateMultipartUpload',
  'name/cos:ListMultipartUploads',
  'name/cos:ListParts',
  'name/cos:UploadPart',
  'name/cos:CompleteMultipartUpload',
  'name/cos:AbortMultipartUpload',
] as const

const getCosSts = async () => {
  const sts = await import('qcloud-cos-sts')
  return (sts.default ?? sts) as unknown as {
    getCredential: (
      options: Record<string, unknown>,
      callback: (error: Error | null, credential: TemporaryCredential) => void
    ) => void
  }
}

const parseCosBucket = () => {
  const match = env.cosBucket.match(/^(.*)-(\d+)$/)

  if (!match) {
    throw new Error('COS_BUCKET 必须包含 appid，例如 album-1250000000')
  }

  return {
    shortBucketName: match[1],
    appId: match[2],
  }
}

const normalizeCosKey = (cosKey: string) => cosKey.replace(/^\/+/, '')

let cosClient: CosClient | null = null

const getCosClient = () => {
  cosClient ??= new COS({
    SecretId: env.tencentSecretId,
    SecretKey: env.tencentSecretKey,
  })

  return cosClient
}

const createCosResource = (cosKey: string) => {
  const { appId, shortBucketName } = parseCosBucket()
  return `qcs::cos:${env.cosRegion}:uid/${appId}:prefix//${appId}/${shortBucketName}/${normalizeCosKey(cosKey)}`
}

const buildCosQueryString = (query: CosQuery = {}) =>
  Object.entries(query)
    .filter(
      (entry): entry is [string, Exclude<CosQueryValue, null | undefined>] => {
        const [, value] = entry
        return value !== null && value !== undefined
      }
    )
    .map(([key, value]) => {
      if (value === '') {
        return key
      }

      return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    })
    .join('&')

export const createCosKey = (
  spaceId: string,
  folderId: string,
  filename: string
) => {
  const safeFilename = filename.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_')
  return [
    env.cosUploadPrefix.replace(/^\/|\/$/g, ''),
    spaceId,
    folderId,
    `${randomUUID()}-${safeFilename}`,
  ]
    .filter(Boolean)
    .join('/')
}

export const getUploadCredential = async (cosKey: string) => {
  const sts = await getCosSts()
  const normalizedCosKey = normalizeCosKey(cosKey)

  return new Promise<TemporaryCredential>((resolve, reject) => {
    sts.getCredential(
      {
        secretId: env.tencentSecretId,
        secretKey: env.tencentSecretKey,
        durationSeconds: env.cosUploadCredentialExpiresSeconds,
        policy: {
          version: '2.0',
          statement: [
            {
              effect: 'allow',
              action: [...UPLOAD_ACTIONS],
              resource: [createCosResource(normalizedCosKey)],
            },
          ],
        },
      },
      (error, credential) => {
        if (error) {
          reject(error)
          return
        }

        resolve(credential)
      }
    )
  })
}

export const getSignedReadUrl = (cosKey: string, query: CosQuery = {}) => {
  const normalizedCosKey = normalizeCosKey(cosKey)
  const queryString = buildCosQueryString(query)

  return getCosClient().getObjectUrl(
    {
      Bucket: env.cosBucket,
      Region: env.cosRegion,
      Key: normalizedCosKey,
      Method: 'GET',
      Expires: env.cosSignedUrlExpiresSeconds,
      Sign: true,
      QueryString: queryString || undefined,
    },
    () => {}
  )
}
