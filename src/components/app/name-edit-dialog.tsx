'use client'

import { type FormEvent, useEffect, useId, useState } from 'react'

import { ErrorBanner } from '@/components/app/error-banner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

type NameEditDialogProps = {
  initialName: string
  label: string
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string) => Promise<string | null>
  open: boolean
  pendingLabel?: string
  submitLabel?: string
  title: string
}

export function NameEditDialog({
  initialName,
  label,
  onOpenChange,
  onSubmit,
  open,
  pendingLabel = '保存中',
  submitLabel = '保存',
  title,
}: NameEditDialogProps) {
  const inputId = useId()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(initialName)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (open) {
      setName(initialName)
      setError(null)
      setPending(false)
    }
  }, [initialName, open])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (pending) {
      return
    }

    setPending(true)
    setError(null)

    try {
      const message = await onSubmit(name)

      if (message) {
        setError(message)
        return
      }

      onOpenChange(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ca-name-dialog-content" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form className="ca-name-dialog-form" onSubmit={handleSubmit}>
          <ErrorBanner message={error ?? undefined} />
          <label className="sr-only" htmlFor={inputId}>
            {label}
          </label>
          <Input
            id={inputId}
            autoFocus
            aria-label={label}
            className="ca-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <div className="ca-dialog-actions">
            <button
              type="button"
              className="ca-secondary-btn"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              取消
            </button>
            <button className="ca-primary-btn" disabled={pending}>
              {pending ? pendingLabel : submitLabel}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
