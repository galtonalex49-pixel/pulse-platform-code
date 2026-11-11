import { timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { adminCookieOptions, ADMIN_COOKIE_NAME, createAdminAccessToken } from '@/lib/admin-access'
import { db } from '@/lib/db'
import { pulseAdminAttempts } from '@/lib/db/schema'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  }

  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const expectedCode = process.env.PULSE_ADMIN_ACCESS_CODE
  if (!expectedCode) {
    return NextResponse.json({ error: 'Admin access is unavailable.' }, { status: 503 })
  }

  const [attempt] = await db
    .select({ failedAttempts: pulseAdminAttempts.failedAttempts, lockedUntil: pulseAdminAttempts.lockedUntil })
    .from(pulseAdminAttempts)
    .where(eq(pulseAdminAttempts.userId, session.user.id))
    .limit(1)

  const now = new Date()
  if (attempt?.lockedUntil && attempt.lockedUntil > now) {
    return NextResponse.json({ error: 'Access temporarily locked. Try again later.' }, { status: 429 })
  }

  let submittedCode = ''
  try {
    const body = (await request.json()) as { code?: unknown }
    if (typeof body.code === 'string' && body.code.length <= 256) submittedCode = body.code
  } catch {
    return NextResponse.json({ error: 'Enter a valid access code.' }, { status: 400 })
  }

  const submitted = Buffer.from(submittedCode)
  const expected = Buffer.from(expectedCode)
  const codeMatches = submitted.length === expected.length && timingSafeEqual(submitted, expected)

  if (!codeMatches) {
    const expiredLock = attempt?.lockedUntil && attempt.lockedUntil <= now
    const failedAttempts = expiredLock ? 1 : (attempt?.failedAttempts ?? 0) + 1
    const lockedUntil = failedAttempts >= 5 ? new Date(now.getTime() + 15 * 60 * 1000) : null

    await db
      .insert(pulseAdminAttempts)
      .values({ userId: session.user.id, failedAttempts, lockedUntil, updatedAt: now })
      .onConflictDoUpdate({
        target: pulseAdminAttempts.userId,
        set: { failedAttempts, lockedUntil, updatedAt: now },
      })

    return NextResponse.json(
      { error: lockedUntil ? 'Access temporarily locked. Try again later.' : 'The access code is incorrect.' },
      { status: lockedUntil ? 429 : 401 },
    )
  }

  await db.delete(pulseAdminAttempts).where(and(eq(pulseAdminAttempts.userId, session.user.id)))

  const response = NextResponse.json({ ok: true })
  response.cookies.set(ADMIN_COOKIE_NAME, createAdminAccessToken(session.user.id), adminCookieOptions)
  return response
}
