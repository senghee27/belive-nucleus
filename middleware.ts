import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from './lib/auth'

const PUBLIC_ROUTES = [
  '/api/auth/',
  '/api/events/lark',
  '/api/cron',
  '/auth/login',
  '/auth/denied',
]

const SECRET_ROUTES = [
  '/api/lark/scan',
  '/api/clusters/compute',
  '/api/briefings',
  '/api/schedules',
  '/api/incidents/escalate',
  '/api/scan-logs',
  '/api/tickets',
  '/api/staff/sync',
  '/api/incidents',
  '/api/clusters',
  '/api/watchdog',
  '/api/groups',
  '/api/staff',
  '/api/push/send',
  '/api/backfill',
]

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Allow public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Allow secret-protected API routes
  if (SECRET_ROUTES.some(route => pathname.startsWith(route))) {
    const secret = request.headers.get('x-nucleus-secret')
    const authHeader = request.headers.get('authorization')
    if (secret === process.env.NUCLEUS_SECRET || authHeader === `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.next()
    }
    // Fall through to session check — allow if user has session too
  }

  // Check for Lark SSO code (coming from Lark Web App)
  const larkCode = searchParams.get('code')
  const state = searchParams.get('state')
  if (larkCode && (state === 'lark_sso' || !state)) {
    const callbackUrl = new URL('/api/auth/lark/callback', request.url)
    callbackUrl.searchParams.set('code', larkCode)
    callbackUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(callbackUrl)
  }

  // Check session cookie
  const sessionCookie = request.cookies.get('nucleus_session')
  if (!sessionCookie) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Verify JWT
  const session = await verifyJWT(sessionCookie.value)
  if (!session) {
    const response = pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'Session expired' }, { status: 401 })
      : NextResponse.redirect(new URL('/auth/login', request.url))
    response.cookies.delete('nucleus_session')
    return response
  }

  // Valid session — attach user info to headers
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-open-id', session.open_id)
  requestHeaders.set('x-user-name', session.name)
  requestHeaders.set('x-user-role', session.role)

  // Mobile detection + redirect
  const ua = request.headers.get('user-agent') ?? ''
  const isMobile = /iPhone|iPad|iPod|Android/i.test(ua)

  if (isMobile && !pathname.startsWith('/m') && !pathname.startsWith('/api') && !pathname.startsWith('/auth')) {
    const mobileMap: Record<string, string> = {
      '/': '/m',
      '/overview': '/m',
      '/command': '/m/queue',
      '/clusters': '/m/clusters',
      '/briefings': '/m/reports',
    }
    const mobilePath = mobileMap[pathname] ?? '/m'
    return NextResponse.redirect(new URL(mobilePath, request.url))
  }

  if (!isMobile && pathname.startsWith('/m')) {
    return NextResponse.redirect(new URL('/overview', request.url))
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
