'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { Check, ChevronRight, FolderPlus, X } from 'lucide-react'

import { EmptyState } from '@/components/app/empty-state'
import { LoadingState } from '@/components/app/loading-state'
import { MobileFrame } from '@/components/app/mobile-frame'
import { PullToRefresh } from '@/components/app/pull-to-refresh'
import { TopBar } from '@/components/app/top-bar'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  createFolderAction,
  getCopyTargetFoldersAction,
} from '@/features/albums/actions'
import { getShareImportViewAction } from '@/features/app/view-actions'
import { useFixedBackNavigation } from '@/hooks/use-fixed-back-navigation'
import { useServerAction } from '@/hooks/use-server-action'
import {
  hasArrayField,
  isRecord,
} from '@/lib/cache-validation'
import {
  cleanupExpiredShareImports,
  getShareImportBatch,
  type ShareImportBatch,
} from '@/lib/share-import-store'

type FolderTarget = {
  id: string
  mediaCount: number
  name: string
}
type ShareImportViewData = Awaited<ReturnType<typeof getShareImportViewAction>>

const ERROR_TEXT: Record<string, string> = {
  empty: '没有可导入的图片或视频',
  storage: '导入失败，请稍后再试',
  'too-many': '导入失败，请稍后再试',
  worker: '导入失败，请稍后再试',
}

const getImportHref = (batchId: string | null) =>
  batchId
    ? `/share/import?batch=${encodeURIComponent(batchId)}`
    : '/share/import'

const isShareImportViewData = (
  value: unknown
): value is ShareImportViewData =>
  isRecord(value) &&
  typeof value.authenticated === 'boolean' &&
  hasArrayField(value, 'spaces')

export function ShareImportClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const batchId = searchParams.get('batch')
  const errorCode = searchParams.get('error')
  const isDevPreview =
    process.env.NODE_ENV === 'development' && !batchId && !errorCode
  const [batch, setBatch] = useState<ShareImportBatch | null>(null)
  const [batchLoading, setBatchLoading] = useState(true)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null)
  const [folders, setFolders] = useState<FolderTarget[]>([])
  const [foldersLoading, setFoldersLoading] = useState(false)
  const [foldersError, setFoldersError] = useState<string | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('我的相册')
  const [createPending, setCreatePending] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const { data, error, loading, refresh } = useServerAction(
    () => getShareImportViewAction(),
    [],
    {
      cacheVersion: 'share-import-view:v1',
      validateCacheData: isShareImportViewData,
    }
  )
  const importHref = getImportHref(batchId)
  const selectedSpace = useMemo(
    () =>
      data?.authenticated
        ? data.spaces.find((space) => space.id === selectedSpaceId)
        : undefined,
    [data, selectedSpaceId]
  )
  const closeAlbumPicker = useCallback(() => {
    setSelectedSpaceId(null)
  }, [])
  const { requestBack } = useFixedBackNavigation('/spaces', {
    blocking: Boolean(selectedSpaceId),
    onBlockedBack: closeAlbumPicker,
  })

  useEffect(() => {
    let active = true

    const loadBatch = async () => {
      setBatchLoading(true)
      setBatchError(null)

      try {
        await cleanupExpiredShareImports()

        if (errorCode) {
          setBatch(null)
          setBatchError(ERROR_TEXT[errorCode] ?? '导入失败，请稍后再试')
          return
        }

        if (isDevPreview) {
          setBatch({
            id: 'dev-preview',
            createdAt: Date.now(),
            fileCount: 0,
          })
          return
        }

        if (!batchId) {
          setBatch(null)
          setBatchError('没有可导入的图片或视频')
          return
        }

        const nextBatch = await getShareImportBatch(batchId)

        if (!active) {
          return
        }

        if (!nextBatch) {
          setBatch(null)
          setBatchError('导入内容已失效')
          return
        }

        setBatch(nextBatch)
      } catch (error) {
        if (!active) {
          return
        }

        setBatchError('导入失败，请稍后再试')
      } finally {
        if (active) {
          setBatchLoading(false)
        }
      }
    }

    void loadBatch()

    return () => {
      active = false
    }
  }, [batchId, errorCode, isDevPreview])

  useEffect(() => {
    if (!selectedSpaceId) {
      setFolders([])
      setSelectedFolderId('')
      return
    }

    let active = true

    const loadFolders = async () => {
      setFoldersLoading(true)
      setFoldersError(null)
      setCreateOpen(false)
      setCreateError(null)

      try {
        const result = await getCopyTargetFoldersAction(selectedSpaceId)

        if (!active) {
          return
        }

        if (!result.ok) {
          setFolders([])
          setSelectedFolderId('')
          setFoldersError(result.error)
          return
        }

        const nextFolders = result.folders

        setFolders(nextFolders)
        setSelectedFolderId((current) =>
          nextFolders.some((folder) => folder.id === current)
            ? current
            : (nextFolders[0]?.id ?? '')
        )
      } catch (error) {
        if (active) {
          setFoldersError(
            error instanceof Error ? error.message : '读取相册失败'
          )
        }
      } finally {
        if (active) {
          setFoldersLoading(false)
        }
      }
    }

    void loadFolders()

    return () => {
      active = false
    }
  }, [selectedSpaceId])

  const handleCreateFolder = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      if (!selectedSpaceId || createPending) {
        return
      }

      setCreatePending(true)
      setCreateError(null)

      const formData = new FormData()
      formData.set('name', createName)

      try {
        const result = await createFolderAction(selectedSpaceId, formData)

        if (!result.ok || !result.folderId) {
          setCreateError(result.error ?? '创建相册失败')
          return
        }

        const createdFolder = {
          id: result.folderId,
          name: createName.trim() || '我的相册',
          mediaCount: 0,
        }

        setFolders((current) => [createdFolder, ...current])
        setSelectedFolderId(result.folderId)
        setCreateOpen(false)
        setCreateName('我的相册')
      } finally {
        setCreatePending(false)
      }
    },
    [createName, createPending, selectedSpaceId]
  )

  const targetHref = useMemo(() => {
    if (!selectedSpaceId || !selectedFolderId) {
      return ''
    }

    if (isDevPreview) {
      return `/spaces/${selectedSpaceId}/albums/${selectedFolderId}/upload`
    }

    if (!batchId) {
      return ''
    }

    return `/spaces/${selectedSpaceId}/albums/${selectedFolderId}/upload?shareBatch=${encodeURIComponent(batchId)}`
  }, [batchId, isDevPreview, selectedFolderId, selectedSpaceId])

  const submitTarget = () => {
    if (!targetHref) {
      return
    }

    router.replace(targetHref)
  }

  const closeImport = () => {
    requestBack('button')
  }

  const renderAlbumPicker = () => (
    <>
      <div className="ca-copy-target-list">
        {foldersLoading ? (
          <div className="ca-copy-target-state">正在读取相册...</div>
        ) : foldersError ? (
          <div className="ca-copy-target-state">{foldersError}</div>
        ) : (
          <>
            <button
              type="button"
              className="ca-copy-target ca-copy-target-new"
              onClick={() => {
                setCreateOpen((open) => !open)
                setCreateError(null)
              }}
            >
              <span className="ca-copy-target-new-content">
                <FolderPlus className="ca-copy-target-leading-icon" />
                <span className="ca-copy-target-name">新建相册</span>
              </span>
              <i className="ca-copy-target-check" aria-hidden="true" />
            </button>

            {createOpen ? (
              <form
                className="ca-copy-create-form"
                onSubmit={handleCreateFolder}
              >
                <Input
                  autoFocus
                  aria-label="新相册名称"
                  className="ca-input"
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                />
                <button
                  type="submit"
                  className="ca-primary-btn"
                  disabled={createPending}
                >
                  {createPending ? '创建中' : '创建'}
                </button>
                {createError ? (
                  <p className="ca-copy-create-error">{createError}</p>
                ) : null}
              </form>
            ) : null}

            {folders.length > 0 ? (
              folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className={`ca-copy-target ${
                    selectedFolderId === folder.id ? 'active' : ''
                  }`}
                  onClick={() => setSelectedFolderId(folder.id)}
                >
                  <span className="ca-copy-target-name">{folder.name}</span>
                  <small>{folder.mediaCount} 项</small>
                  {selectedFolderId === folder.id ? (
                    <Check className="ca-copy-target-check" />
                  ) : (
                    <i className="ca-copy-target-check" aria-hidden="true" />
                  )}
                </button>
              ))
            ) : (
              <div className="ca-copy-target-state">还没有相册</div>
            )}
          </>
        )}
      </div>

      <DialogFooter className="ca-dialog-actions ca-copy-dialog-actions">
        <button
          type="button"
          className="ca-secondary-btn"
          onClick={closeAlbumPicker}
        >
          取消
        </button>
        <button
          type="button"
          className="ca-primary-btn"
          disabled={!targetHref || foldersLoading || Boolean(foldersError)}
          onClick={submitTarget}
        >
          导入
        </button>
      </DialogFooter>
    </>
  )

  const renderSpacePageContent = () => {
    if (batchLoading || loading) {
      return <LoadingState />
    }

    if (batchError) {
      return <EmptyState title={batchError} />
    }

    if (error) {
      return <EmptyState title={error} />
    }

    if (!batch) {
      return <EmptyState title="没有可导入的图片或视频" />
    }

    if (!data?.authenticated) {
      return (
        <EmptyState title="请先登录">
          <div className="grid gap-3">
            <span>登录后继续选择空间和相册。</span>
            <Link
              href={`/login?next=${encodeURIComponent(importHref)}`}
              className="ca-primary-btn"
            >
              登录
            </Link>
          </div>
        </EmptyState>
      )
    }

    if (data.spaces.length === 0) {
      return <EmptyState title="还没有空间">请先创建空间后再导入。</EmptyState>
    }

    return (
      <div className="ca-list">
        {data.spaces.map((space) => (
          <button
            key={space.id}
            type="button"
            className="ca-space-row w-full text-left"
            onClick={() => setSelectedSpaceId(space.id)}
          >
            <span className="ca-space-avatar">{space.name.slice(0, 1)}</span>
            <span className="min-w-0">
              <strong>{space.name}</strong>
              <small>
                {space.memberCount} 位成员 · {space.folderCount} 个相册
              </small>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    )
  }

  return (
    <MobileFrame className="ca-scroll-layout">
      <div className="ca-fixed-section">
        <TopBar
          title="导入到相册"
          leading={
            <button
              type="button"
              className="ca-icon-btn"
              aria-label="关闭导入"
              onClick={closeImport}
            >
              <X />
            </button>
          }
        />
      </div>

      <PullToRefresh onRefresh={refresh}>
        {renderSpacePageContent()}
      </PullToRefresh>

      <Dialog
        open={Boolean(selectedSpaceId)}
        onOpenChange={(open) => {
          if (!open) {
            closeAlbumPicker()
          }
        }}
      >
        <DialogContent className="ca-copy-dialog">
          <DialogHeader>
            <DialogTitle>选择相册</DialogTitle>
          </DialogHeader>
          {selectedSpace ? renderAlbumPicker() : null}
        </DialogContent>
      </Dialog>
    </MobileFrame>
  )
}
