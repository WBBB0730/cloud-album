'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { ErrorBanner } from '@/components/app/error-banner'
import { useGlobalLoading } from '@/components/app/global-loading'
import { MobileFrame } from '@/components/app/mobile-frame'
import { TopBar } from '@/components/app/top-bar'
import { Input } from '@/components/ui/input'
import { createSpaceAction } from '@/features/spaces/actions'
import { useFixedBackNavigation } from '@/hooks/use-fixed-back-navigation'

export function NewSpaceClient() {
  const router = useRouter()
  const { hideLoading } = useGlobalLoading()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  useFixedBackNavigation('/spaces')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setPending(true)

    try {
      const result = await createSpaceAction(new FormData(event.currentTarget))

      if (!result.ok || !result.spaceId) {
        setError(result.error ?? '创建空间失败')
        return
      }

      router.replace(`/spaces/${result.spaceId}`)
    } finally {
      setPending(false)
      hideLoading()
    }
  }

  return (
    <MobileFrame className="ca-scroll-layout">
      <div className="ca-fixed-section">
        <TopBar
          title="新建空间"
          leading={
            <Link
              replace
              href="/spaces"
              className="ca-icon-btn"
              aria-label="返回"
            >
              <ChevronLeft />
            </Link>
          }
        />
      </div>
      <div className="ca-scroll-section">
        <form onSubmit={handleSubmit} className="ca-form-stack">
          <ErrorBanner message={error ?? undefined} />
          <label className="ca-field">
            <span>空间名称</span>
            <Input name="name" className="ca-input" />
          </label>
          <button className="ca-primary-btn" disabled={pending}>
            创建空间
          </button>
        </form>
      </div>
    </MobileFrame>
  )
}
