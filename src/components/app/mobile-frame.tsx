import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function MobileFrame({
  children,
  className,
  variant = "app",
}: {
  children: ReactNode
  className?: string
  variant?: "app" | "auth" | "dark"
}) {
  return (
    <main className="ca-page">
      <div
        className={cn(
          variant === "auth" && "ca-auth-app",
          variant === "app" && "ca-app",
          variant === "dark" && "ca-dark-app",
          className
        )}
      >
        {children}
      </div>
    </main>
  )
}
