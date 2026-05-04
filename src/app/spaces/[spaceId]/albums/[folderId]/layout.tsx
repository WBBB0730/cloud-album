import type { ReactNode } from "react"

export async function generateStaticParams() {
  return []
}

export default function FolderIdLayout({ children }: { children: ReactNode }) {
  return children
}
