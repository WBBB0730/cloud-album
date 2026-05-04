import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function TopBar({
  title,
  subtitle,
  leading,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: string
  leading?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('ca-topbar', className)}>
      {leading}
      <div className={subtitle ? 'ca-title-stack' : 'min-w-0 flex-1'}>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  )
}
