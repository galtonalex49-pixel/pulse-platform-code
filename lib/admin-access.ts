import { createHmac, timingSafeEqual } from 'node:crypto'

export const ADMIN_COOKIE_NAME = 'pulse_admin_access'
const ADMIN_ACCESS_TTL_SECONDS = 60 * 60 * 6

function secret() {
  const value = process.env.BETTER_AUTH_SECRET
  if (!value || value.length < 32) throw new Error('Server signing secret is unavailable.')
  return value
}

function signature(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function createAdminAccessToken(userId: string) {
  const payload = Buffer.from(
    JSON.stringify({ userId, expiresAt: Date.now() + ADMIN_ACCESS_TTL_SECONDS * 1000 }),
  ).toString('base64url')
  return `${payload}.${signature(payload)}`
}

export function verifyAdminAccessToken(token: string | undefined, userId: string) {
  if (!token) return false
  const separator = token.lastIndexOf('.')
  if (separator <= 0) return false

  const payload = token.slice(0, separator)
  const supplied = Buffer.from(token.slice(separator + 1))
  const expected = Buffer.from(signature(payload))
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return false
  }

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId?: string
      expiresAt?: number
    }
    return data.userId === userId && typeof data.expiresAt === 'number' && data.expiresAt > Date.now()
  } catch {
    return false
  }
}

export const adminCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: process.env.NODE_ENV === 'development' ? ('none' as const) : ('lax' as const),
  path: '/',
  maxAge: ADMIN_ACCESS_TTL_SECONDS,
}
