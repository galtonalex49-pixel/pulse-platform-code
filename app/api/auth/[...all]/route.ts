import { createHash } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { toNextJsHandler } from 'better-auth/next-js'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { pulseLoginAttempts } from '@/lib/db/schema'

export const runtime = 'nodejs'

const handlers = toNextJsHandler(auth)
const usernamePattern = /^[a-z0-9_][a-z0-9_.]{1,28}[a-z0-9_]$/i
const pinPattern = /^\d{4}$/

export const GET = handlers.GET

function invalidCredentials() {
  return NextResponse.json(
    { error: 'Invalid username or PIN.' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  )
}

function parseCredentials(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!usernamePattern.test(username) || !pinPattern.test(password)) return null
  return { username: username.toLowerCase(), password }
}

async function parseBody(request: Request) {
  try {
    return await request.clone().json()
  } catch {
    return null
  }
}

async function noteFailedPin(username: string) {
  const now = new Date()
  await db
    .insert(pulseLoginAttempts)
    .values({ username, failedAttempts: 1, updatedAt: now })
    .onConflictDoUpdate({
      target: pulseLoginAttempts.username,
      set: {
        failedAttempts: sql`${pulseLoginAttempts.failedAttempts} + 1`,
        lockedUntil: sql`CASE
          WHEN ${pulseLoginAttempts.failedAttempts} + 1 >= 5 THEN
            NOW() + (
              LEAST(
                1440,
                15 * POWER(2, GREATEST(0, FLOOR((${pulseLoginAttempts.failedAttempts} + 1 - 5) / 5.0)))
              ) * INTERVAL '1 minute'
            )
          ELSE NULL
        END`,
        updatedAt: now,
      },
    })
}

async function forwardWithBody(request: Request, body: Record<string, string>) {
  const headers = new Headers(request.headers)
  headers.delete('content-length')
  headers.delete('host')
  return handlers.POST(
    new Request(request.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  )
}

export async function POST(request: Request) {
  const path = new URL(request.url).pathname

  if (path.endsWith('/sign-in/email')) return invalidCredentials()

  if (path.endsWith('/sign-up/email')) {
    const credentials = parseCredentials(await parseBody(request))
    if (!credentials) return invalidCredentials()

    const emailHash = createHash('sha256').update(credentials.username).digest('hex')
    return forwardWithBody(request, {
      username: credentials.username,
      name: credentials.username,
      password: credentials.password,
      email: `${emailHash}@accounts.pulse.invalid`,
    })
  }

  if (path.endsWith('/sign-in/username')) {
    const credentials = parseCredentials(await parseBody(request))
    if (!credentials) return invalidCredentials()

    try {
      const [attempt] = await db
        .select({ lockedUntil: pulseLoginAttempts.lockedUntil })
        .from(pulseLoginAttempts)
        .where(eq(pulseLoginAttempts.username, credentials.username))
        .limit(1)

      if (attempt?.lockedUntil && attempt.lockedUntil > new Date()) {
        return invalidCredentials()
      }

      const response = await handlers.POST(request)
      const responseBody = await response.clone().json().catch(() => null)
      const bodyHasError =
        responseBody &&
        typeof responseBody === 'object' &&
        'error' in responseBody &&
        Boolean(responseBody.error)

      if (response.ok && !bodyHasError) {
        await db
          .delete(pulseLoginAttempts)
          .where(eq(pulseLoginAttempts.username, credentials.username))
        return response
      }

      await noteFailedPin(credentials.username)
      return invalidCredentials()
    } catch {
      return NextResponse.json(
        { error: 'Authentication is temporarily unavailable.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      )
    }
  }

  return handlers.POST(request)
}
