import type { ReactNode } from 'react'

export function EmptyState({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <div className="ca-empty-state">
      <div>
        <p>{title}</p>
        {children ? (
          <div className="ca-empty-state-detail">{children}</div>
        ) : null}
      </div>
    </div>
  )
}
