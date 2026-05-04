import type { ReactNode } from "react"

export const revalidate = false

export async function generateStaticParams() {
  return []
}

export default function SpaceIdLayout({ children }: { children: ReactNode }) {
  return children
}
