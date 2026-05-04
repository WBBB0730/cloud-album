'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { ErrorBanner } from '@/components/app/error-banner'
import { useGlobalLoading } from '@/components/app/global-loading'
import { LoadingState } from '@/components/app/loading-state'
import { MobileFrame } from '@/components/app/mobile-frame'
import { TopBar } from '@/components/app/top-bar'
import { Input } from '@/components/ui/input'
import { createFolderAction } from '@/features/albums/actions'
import { getNewFolderViewAction } from '@/features/app/view-actions'
import { useServerAction } from '@/hooks/use-server-action'

export function NewFolderClient({
  spaceId,
}: {
  spaceId: string
}) {
  const router = useRouter()
  const { hideLoading } = useGlobalLoading()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const { data, loading } = useServerAction(
    () => getNewFolderViewAction(spaceId),
    [spaceId]
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setPending(true)

    try {
      const result = await createFolderAction(
        spaceId,
        new FormData(event.currentTarget)
      )

      if (!result.ok || !result.folderId) {
        setError(result.error ?? '创建相册失败')
        return
      }

      router.replace(`/spaces/${spaceId}/albums/${result.folderId}`)
    } finally {
      setPending(false)
      hideLoading()
    }
  }

  return (
    <MobileFrame className="ca-scroll-layout">
      <div className="ca-fixed-section">
        <TopBar
          title="新建相册"
          subtitle={data?.space.name}
          leading={
            <Link
              replace
              href={`/spaces/${spaceId}`}
              className="ca-icon-btn"
              aria-label="返回"
            >
              <ChevronLeft />
            </Link>
          }
        />
      </div>
      <div className="ca-scroll-section">
        {loading ? <LoadingState /> : null}
        <form onSubmit={handleSubmit} className="ca-form-stack">
          <ErrorBanner message={error ?? undefined} />
          <label className="ca-field">
            <span>相册名称</span>
            <Input name="name" className="ca-input" />
          </label>
          <button className="ca-primary-btn" disabled={pending}>
            创建相册
          </button>
        </form>
      </div>
    </MobileFrame>
  )
}
