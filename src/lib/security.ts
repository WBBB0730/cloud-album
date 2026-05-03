import "server-only"

import { createHash, createHmac, randomBytes } from "crypto"

import { env } from "@/lib/env"

export const randomToken = () => randomBytes(32).toString("base64url")

export const hashSessionToken = (token: string) =>
  createHash("sha256").update(token).digest("hex")

export const hashInviteToken = (token: string) =>
  createHmac("sha256", env.inviteTokenSecret).update(token).digest("hex")

export const normalizePhone = (phone: string) => phone.replace(/[\s-]/g, "").trim()

export const safeName = (name: string) => name.trim().slice(0, 80)
