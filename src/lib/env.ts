const optionalNumber = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const required = (name: string) => {
  const value = process.env[name]

  if (!value) {
    throw new Error(`缺少环境变量 ${name}`)
  }

  return value
}

export const env = {
  get appUrl() {
    return required('APP_URL')
  },
  get databaseUrl() {
    return required('DATABASE_URL')
  },
  get sessionSecret() {
    return required('SESSION_SECRET')
  },
  get inviteTokenSecret() {
    return required('INVITE_TOKEN_SECRET')
  },
  get tencentSecretId() {
    return required('TENCENT_CLOUD_SECRET_ID')
  },
  get tencentSecretKey() {
    return required('TENCENT_CLOUD_SECRET_KEY')
  },
  get cosBucket() {
    return required('COS_BUCKET')
  },
  get cosRegion() {
    return required('COS_REGION')
  },
  get cosUploadPrefix() {
    return process.env.COS_UPLOAD_PREFIX ?? 'cloud-album'
  },
  get cosSignedUrlExpiresSeconds() {
    return optionalNumber(process.env.COS_SIGNED_URL_EXPIRES_SECONDS, 900)
  },
  get cosUploadCredentialExpiresSeconds() {
    return optionalNumber(
      process.env.COS_UPLOAD_CREDENTIAL_EXPIRES_SECONDS,
      1800
    )
  },
  get bootstrapAdminPhone() {
    return required('BOOTSTRAP_ADMIN_PHONE')
  },
  get bootstrapAdminName() {
    return required('BOOTSTRAP_ADMIN_NAME')
  },
  get bootstrapAdminPassword() {
    return required('BOOTSTRAP_ADMIN_PASSWORD')
  },
}
