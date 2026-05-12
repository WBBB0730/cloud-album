'use client'

export type ShareImportBatch = {
  createdAt: number
  fileCount: number
  id: string
}

export type ShareImportFileRecord = {
  batchId: string
  file: File
  id: string
  lastModified: number
  name: string
  order: number
  size: number
  type: string
}

const DB_NAME = 'cloud-album-share-imports'
const DB_VERSION = 1
const BATCH_STORE = 'batches'
const FILE_STORE = 'files'
const FILE_BATCH_INDEX = 'batchId'
const SHARE_IMPORT_TTL_MS = 24 * 60 * 60 * 1000

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 失败'))
  })

const waitForTransaction = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB 事务中断'))
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB 事务失败'))
  })

const openShareImportDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(BATCH_STORE)) {
        db.createObjectStore(BATCH_STORE, { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains(FILE_STORE)) {
        const fileStore = db.createObjectStore(FILE_STORE, { keyPath: 'id' })
        fileStore.createIndex(FILE_BATCH_INDEX, 'batchId')
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('打开导入缓存失败'))
  })

const withDb = async <T>(task: (db: IDBDatabase) => Promise<T>) => {
  const db = await openShareImportDb()

  try {
    return await task(db)
  } finally {
    db.close()
  }
}

export const getShareImportBatch = async (batchId: string) =>
  withDb(async (db) => {
    const transaction = db.transaction(BATCH_STORE, 'readonly')
    const batch = await requestToPromise<ShareImportBatch | undefined>(
      transaction.objectStore(BATCH_STORE).get(batchId)
    )

    return batch ?? null
  })

export const listShareImportFiles = async (batchId: string) =>
  withDb(async (db) => {
    const transaction = db.transaction(FILE_STORE, 'readonly')
    const records = await requestToPromise<ShareImportFileRecord[]>(
      transaction
        .objectStore(FILE_STORE)
        .index(FILE_BATCH_INDEX)
        .getAll(batchId)
    )

    return records.sort((first, second) => first.order - second.order)
  })

export const deleteShareImportBatch = async (batchId: string) =>
  withDb(async (db) => {
    const readTransaction = db.transaction(FILE_STORE, 'readonly')
    const keys = await requestToPromise<IDBValidKey[]>(
      readTransaction
        .objectStore(FILE_STORE)
        .index(FILE_BATCH_INDEX)
        .getAllKeys(batchId)
    )
    const transaction = db.transaction([BATCH_STORE, FILE_STORE], 'readwrite')
    const batchStore = transaction.objectStore(BATCH_STORE)
    const fileStore = transaction.objectStore(FILE_STORE)

    batchStore.delete(batchId)

    for (const key of keys) {
      fileStore.delete(key)
    }

    await waitForTransaction(transaction)
  })

export const cleanupExpiredShareImports = async () =>
  withDb(async (db) => {
    const readTransaction = db.transaction(BATCH_STORE, 'readonly')
    const batches = await requestToPromise<ShareImportBatch[]>(
      readTransaction.objectStore(BATCH_STORE).getAll()
    )
    const expiredBefore = Date.now() - SHARE_IMPORT_TTL_MS

    for (const batch of batches) {
      if (batch.createdAt >= expiredBefore) {
        continue
      }

      const keyTransaction = db.transaction(FILE_STORE, 'readonly')
      const keys = await requestToPromise<IDBValidKey[]>(
        keyTransaction
          .objectStore(FILE_STORE)
          .index(FILE_BATCH_INDEX)
          .getAllKeys(batch.id)
      )
      const transaction = db.transaction([BATCH_STORE, FILE_STORE], 'readwrite')
      const batchStore = transaction.objectStore(BATCH_STORE)
      const fileStore = transaction.objectStore(FILE_STORE)

      batchStore.delete(batch.id)

      for (const key of keys) {
        fileStore.delete(key)
      }

      await waitForTransaction(transaction)
    }
  })
