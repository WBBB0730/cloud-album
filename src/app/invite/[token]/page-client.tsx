'use client'

import { InviteClient } from './invite-client'

export function InvitePageClient({ token }: { token: string }) {
  return <InviteClient token={token} />
}
