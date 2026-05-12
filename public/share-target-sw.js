const DB_NAME = 'cloud-album-share-imports'
const DB_VERSION = 1
const BATCH_STORE = 'batches'
const FILE_STORE = 'files'
const FILE_BATCH_INDEX = 'batchId'
const SHARE_TARGET_PATH = '/share-target'
const MAX_FILE_COUNT = 100

const ACCEPTED_EXTENSIONS = new Set([
  'avif',
  'gif',
  'heic',
  'heif',
  'jpeg',
  'jpg',
  'm4v',
  'mov',
  'mp4',
  'png',
  'webm',
  'webp',
])

const requestToPromise = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB 失败'))
  })

const waitForTransaction = (transaction) =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () =>
      reject(transaction.error || new Error('IndexedDB 事务中断'))
    transaction.onerror = () =>
      reject(transaction.error || new Error('IndexedDB 事务失败'))
  })

const openDb = () =>
  new Promise((resolve, reject) => {
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
      reject(request.error || new Error('打开导入缓存失败'))
  })

const getExtension = (name) => {
  const index = name.lastIndexOf('.')

  return index >= 0 ? name.slice(index + 1).toLowerCase() : ''
}

const isFileLike = (item) =>
  item &&
  typeof item === 'object' &&
  typeof item.name === 'string' &&
  typeof item.size === 'number' &&
  typeof item.type === 'string'

const isAcceptedFile = (file) => {
  if (!isFileLike(file) || file.size <= 0) {
    return false
  }

  if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
    return true
  }

  return ACCEPTED_EXTENSIONS.has(getExtension(file.name))
}

const getSharedFiles = (formData) => {
  const files = formData.getAll('mediaFiles').filter((item) => isFileLike(item))

  if (files.length > 0) {
    return files
  }

  return Array.from(formData.values()).filter((item) => isFileLike(item))
}

const storeSharedFiles = async (files) => {
  const db = await openDb()
  const batchId = crypto.randomUUID()
  const createdAt = Date.now()

  try {
    const transaction = db.transaction([BATCH_STORE, FILE_STORE], 'readwrite')
    const batchStore = transaction.objectStore(BATCH_STORE)
    const fileStore = transaction.objectStore(FILE_STORE)

    batchStore.put({
      id: batchId,
      createdAt,
      fileCount: files.length,
    })

    files.forEach((file, order) => {
      fileStore.put({
        id: `${batchId}:${order}`,
        batchId,
        order,
        file,
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
      })
    })

    await waitForTransaction(transaction)
    return batchId
  } finally {
    db.close()
  }
}

const redirectToImport = (params) => {
  const url = new URL('/share/import', self.location.origin)

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  return Response.redirect(url.href, 303)
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  if (event.request.method !== 'POST' || url.pathname !== SHARE_TARGET_PATH) {
    return
  }

  event.respondWith(
    (async () => {
      try {
        const formData = await event.request.formData()
        const sharedFiles = getSharedFiles(formData)
        const acceptedFiles = sharedFiles.filter(isAcceptedFile)

        if (sharedFiles.length > MAX_FILE_COUNT) {
          return redirectToImport({ error: 'too-many' })
        }

        if (acceptedFiles.length === 0) {
          return redirectToImport({ error: 'empty' })
        }

        const batchId = await storeSharedFiles(acceptedFiles)

        return redirectToImport({ batch: batchId })
      } catch {
        return redirectToImport({ error: 'storage' })
      }
    })()
  )
})
