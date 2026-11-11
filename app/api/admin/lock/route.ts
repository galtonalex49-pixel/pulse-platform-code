import { NextResponse } from 'next/server'
import { adminCookieOptions, ADMIN_COOKIE_NAME } from '@/lib/admin-access'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(ADMIN_COOKIE_NAME, '', { ...adminCookieOptions, maxAge: 0 })
  return response
}
