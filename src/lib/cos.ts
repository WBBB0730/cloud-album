import "server-only"

import { createHash, createHmac, randomUUID } from "crypto"

import { env } from "@/lib/env"

type TemporaryCredential = {
  credentials: {
    tmpSecretId: string
    tmpSecretKey: string
    sessionToken: string
  }
  startTime: number
  expiredTime: number
}

const UPLOAD_ACTIONS = [
  "name/cos:PutObject",
  "name/cos:PostObject",
  "name/cos:InitiateMultipartUpload",
  "name/cos:ListMultipartUploads",
  "name/cos:ListParts",
  "name/cos:UploadPart",
  "name/cos:CompleteMultipartUpload",
  "name/cos:AbortMultipartUpload",
] as const

const getCosSts = async () => {
  const sts = await import("qcloud-cos-sts")
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
    throw new Error("COS_BUCKET 必须包含 appid，例如 album-1250000000")
  }

  return {
    shortBucketName: match[1],
    appId: match[2],
  }
}

const normalizeCosKey = (cosKey: string) => cosKey.replace(/^\/+/, "")

const createCosResource = (cosKey: string) => {
  const { appId, shortBucketName } = parseCosBucket()
  return `qcs::cos:${env.cosRegion}:uid/${appId}:prefix//${appId}/${shortBucketName}/${normalizeCosKey(cosKey)}`
}

export const createCosKey = (spaceId: string, folderId: string, filename: string) => {
  const safeFilename = filename.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_")
  return [
    env.cosUploadPrefix.replace(/^\/|\/$/g, ""),
    spaceId,
    folderId,
    `${randomUUID()}-${safeFilename}`,
  ]
    .filter(Boolean)
    .join("/")
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
          version: "2.0",
          statement: [
            {
              effect: "allow",
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

const hmacSha1 = (key: string, value: string) =>
  createHmac("sha1", key).update(value).digest("hex")

const sha1 = (value: string) => createHash("sha1").update(value).digest("hex")

export const getSignedReadUrl = (cosKey: string) => {
  const normalizedCosKey = normalizeCosKey(cosKey)
  const start = Math.floor(Date.now() / 1000) - 60
  const end = start + env.cosSignedUrlExpiresSeconds
  const keyTime = `${start};${end}`
  const host = `${env.cosBucket}.cos.${env.cosRegion}.myqcloud.com`
  const signedPathname = `/${normalizedCosKey}`
  const urlPathname = `/${normalizedCosKey.split("/").map(encodeURIComponent).join("/")}`
  const httpString = ["get", signedPathname, "", `host=${host}`, ""].join("\n")
  const stringToSign = ["sha1", keyTime, sha1(httpString), ""].join("\n")
  const signKey = hmacSha1(env.tencentSecretKey, keyTime)
  const signature = hmacSha1(signKey, stringToSign)
  const authorization = [
    "q-sign-algorithm=sha1",
    `q-ak=${env.tencentSecretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    "q-header-list=host",
    "q-url-param-list=",
    `q-signature=${signature}`,
  ].join("&")

  return `https://${host}${urlPathname}?${authorization}`
}
