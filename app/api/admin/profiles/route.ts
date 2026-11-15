import { desc, eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { ADMIN_COOKIE_NAME, verifyAdminAccessToken } from '@/lib/admin-access'
import { db } from '@/lib/db'
import { pulseProfiles, user } from '@/lib/db/schema'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cookieStore = await cookies()
  const adminToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!verifyAdminAccessToken(adminToken, session.user.id)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10)
  const requestedOffset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10)
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50
  const offset = Number.isFinite(requestedOffset) ? Math.min(Math.max(requestedOffset, 0), 10000) : 0

  const profiles = await db
    .select({
      id: user.id,
      name: user.name,
      username: pulseProfiles.username,
      balanceCents: pulseProfiles.balanceCents,
      createdAt: user.createdAt,
    })
    .from(user)
    .leftJoin(pulseProfiles, eq(pulseProfiles.userId, user.id))
    .orderBy(desc(user.createdAt))
    .limit(limit + 1)
    .offset(offset)

  const hasMore = profiles.length > limit
  return NextResponse.json(
    {
      profiles: profiles.slice(0, limit),
      nextOffset: hasMore ? offset + limit : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function PATCH(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cookieStore = await cookies()
  const adminToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!verifyAdminAccessToken(adminToken, session.user.id)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const body: unknown = await request.json().catch(() => null)
  const payload = body && typeof body === 'object'
    ? body as { userId?: unknown; balanceCents?: unknown }
    : null
  if (
    typeof payload?.userId !== 'string' ||
    payload.userId.length < 1 ||
    payload.userId.length > 128 ||
    typeof payload.balanceCents !== 'number' ||
    !Number.isSafeInteger(payload.balanceCents) ||
    payload.balanceCents < 0 ||
    payload.balanceCents > 1_000_000_000
  ) {
    return NextResponse.json({ error: 'Invalid profile balance' }, { status: 400 })
  }

  const [profile] = await db
    .update(pulseProfiles)
    .set({ balanceCents: payload.balanceCents })
    .where(eq(pulseProfiles.userId, payload.userId))
    .returning({ balanceCents: pulseProfiles.balanceCents })

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  return NextResponse.json(profile, { headers: { 'Cache-Control': 'no-store' } })
}
