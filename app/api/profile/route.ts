import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { pulseProfiles, user } from '@/lib/db/schema'

export const runtime = 'nodejs'

function createUsername(name: string, userId: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 18) || 'member'
  const suffix = userId.replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase()
  return `${base}_${suffix}`
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let [profile] = await db
    .select({
      username: pulseProfiles.username,
      balanceCents: pulseProfiles.balanceCents,
      createdAt: pulseProfiles.createdAt,
    })
    .from(pulseProfiles)
    .where(eq(pulseProfiles.userId, session.user.id))
    .limit(1)

  if (!profile) {
    await db
      .insert(pulseProfiles)
      .values({
        userId: session.user.id,
        username: createUsername(session.user.name, session.user.id),
        balanceCents: 200000,
      })
      .onConflictDoNothing()

    ;[profile] = await db
      .select({
        username: pulseProfiles.username,
        balanceCents: pulseProfiles.balanceCents,
        createdAt: pulseProfiles.createdAt,
      })
      .from(pulseProfiles)
      .where(eq(pulseProfiles.userId, session.user.id))
      .limit(1)
  }

  if (!profile) {
    return NextResponse.json({ error: 'Profile unavailable' }, { status: 503 })
  }

  const [identity] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1)

  if (!identity) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json(
    {
      id: session.user.id,
      name: identity.name,
      username: profile.username,
      balanceCents: profile.balanceCents,
      createdAt: profile.createdAt.toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
