import type { ReactNode } from "react"

export function EmptyState({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <div className="grid min-h-48 place-items-center rounded-lg border border-dashed border-[#cbd2dc] bg-[#f7f8f8] px-5 text-center">
      <div>
        <p className="font-medium">{title}</p>
        {children ? <div className="mt-2 text-sm text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  )
}
