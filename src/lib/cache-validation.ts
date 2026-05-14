export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const hasArrayField = (
  value: Record<string, unknown>,
  key: string
) => Array.isArray(value[key])

export const hasRecordField = (
  value: Record<string, unknown>,
  key: string
) => isRecord(value[key])

export const hasStringField = (
  value: Record<string, unknown>,
  key: string
) => typeof value[key] === 'string'
