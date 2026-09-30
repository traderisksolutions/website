import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/session'

export async function GET(request: NextRequest) { return out(request) }
export async function POST(request: NextRequest) { return out(request) }

function out(request: NextRequest) {
  const { origin } = new URL(request.url)
  const res = NextResponse.redirect(`${origin}/login`)
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
