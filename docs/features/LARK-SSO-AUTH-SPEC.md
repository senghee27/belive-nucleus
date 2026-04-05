# Lark SSO Authentication — Feature Spec v1.0

**Feature:** Lark SSO + Session Management
**Status:** Planned
**Author:** Lee Seng Hee
**Date:** April 2026

---

## What This Is

Nucleus becomes a native Lark Web App. When Lee clicks the Nucleus
icon in Lark sidebar, it opens and auto-authenticates as Lee Seng Hee
with no login screen. When accessed from a browser directly, a
"Login with Lark" button handles authentication via OAuth.

Same identity either way. Same session. Works everywhere.

---

## Access Model

```
Option B — Lark SSO primary, browser OAuth fallback

Inside Lark:
  Click Nucleus icon → auto-login as Lee → straight to dashboard

Browser (belive-nucleus.vercel.app):
  No valid session → /auth/login page
  "Login with Lark" button → Lark OAuth → back to dashboard
  Valid session → straight to dashboard

Mobile (Lark app):
  Same as desktop Lark — auto-login
```

---

## Allowed Users

```typescript
const ALLOWED_USERS = [
  {
    open_id: 'ou_af2a40628719440234aa29656d06d322',
    name: 'Lee Seng Hee',
    role: 'admin'
  }
  // Future: add team members here with role: 'viewer' etc
]
```

Only open_ids in this list can access Nucleus.
Anyone else → 403 page: "Access denied. This is a private system."

---

## How Lark Web App SSO Works

```
STEP 1 — Lee clicks Nucleus in Lark sidebar
  Lark opens Desktop Homepage URL
  Appends: ?code=abc123&state=lark_sso
  URL: https://belive-nucleus.vercel.app?code=abc123&state=lark_sso

STEP 2 — Nucleus middleware detects code
  Middleware runs on every request
  If ?code present AND no valid session:
    Redirect to /api/auth/lark/callback?code=abc123

STEP 3 — Callback exchanges code for identity
  POST https://open.larksuite.com/open-apis/authen/v1/oidc/access_token
  Headers: Authorization: Basic base64(APP_ID:APP_SECRET)
  Body: { grant_type: "authorization_code", code }
  Response: { access_token, open_id, name, avatar_url, expires_in }

STEP 4 — Verify identity
  Check: is open_id in ALLOWED_USERS?
  If yes → create JWT session → redirect to /
  If no → redirect to /auth/denied

STEP 5 — JWT session cookie
  Payload: { open_id, name, role, access_token, expires_at }
  Cookie: HttpOnly, Secure, SameSite=Lax
  Expires: 7 days
  Name: nucleus_session
```

---

## Browser OAuth Flow (fallback)

```
STEP 1 — Lee visits belive-nucleus.vercel.app in browser
  Middleware: no valid nucleus_session cookie
  Redirect to /auth/login

STEP 2 — Login page
  Clean page: BeLive Nucleus logo + "Login with Lark" button
  Button URL: Lark OAuth authorize endpoint

STEP 3 — Lark OAuth
  Lee logs into Lark (already logged in → instant)
  Lark redirects to /api/auth/lark/callback?code=xxx
  Same callback as SSO flow

STEP 4 — Session created → redirect to /
  Same JWT cookie as SSO flow
  Lee is now authenticated in browser too
```

---

## OAuth URL

```
https://open.larksuite.com/open-apis/authen/v1/authorize
  ?app_id=cli_a95beb5592f8ded0
  &redirect_uri=https://belive-nucleus.vercel.app/api/auth/lark/callback
  &scope=im:message im:message.send_as_user im:chat
  &response_type=code
  &state=browser_login
```

---

## Session JWT Structure

```typescript
type NucleusSession = {
  open_id: string           // ou_af2a40628719440234aa29656d06d322
  name: string              // Lee Seng Hee
  role: 'admin' | 'viewer'
  lark_access_token: string // for sending messages as Lee
  lark_token_expires_at: number // unix timestamp
  session_expires_at: number    // unix timestamp (7 days)
  issued_at: number
}
```

JWT signed with: `JWT_SECRET` env var (generate strong random string)

---

## Middleware (Next.js)

Create: middleware.ts (project root)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from './lib/auth'

// Routes that don't need auth
const PUBLIC_ROUTES = [
  '/api/auth/lark/callback',
  '/api/auth/lark/login',
  '/api/events/lark',      // Lark webhook — must stay public
  '/api/cron',             // Cron routes use NUCLEUS_SECRET
  '/auth/login',
  '/auth/denied',
]

// Routes that use NUCLEUS_SECRET instead of session
const SECRET_ROUTES = [
  '/api/lark/scan',
  '/api/clusters/compute',
  '/api/briefings/',
  '/api/schedules/',
  '/api/incidents/escalate',
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
    if (secret === process.env.NUCLEUS_SECRET) {
      return NextResponse.next()
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check for Lark SSO code (coming from Lark Web App)
  const larkCode = searchParams.get('code')
  const state = searchParams.get('state')
  if (larkCode && state === 'lark_sso') {
    const callbackUrl = new URL('/api/auth/lark/callback', request.url)
    callbackUrl.searchParams.set('code', larkCode)
    callbackUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(callbackUrl)
  }

  // Check session cookie
  const sessionCookie = request.cookies.get('nucleus_session')
  if (!sessionCookie) {
    // No session → redirect to login
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
    // Invalid or expired session
    const response = pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'Session expired' }, { status: 401 })
      : NextResponse.redirect(new URL('/auth/login', request.url))
    response.cookies.delete('nucleus_session')
    return response
  }

  // Valid session — attach user to request headers
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-open-id', session.open_id)
  requestHeaders.set('x-user-name', session.name)
  requestHeaders.set('x-user-role', session.role)

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

---

## Auth Library

Create: lib/auth.ts

```typescript
import { SignJWT, jwtVerify } from 'jose'
import type { NucleusSession } from './types'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!)

const ALLOWED_USERS = [
  {
    open_id: 'ou_af2a40628719440234aa29656d06d322',
    name: 'Lee Seng Hee',
    role: 'admin' as const
  }
]

export async function createSessionJWT(session: NucleusSession)
: Promise<string> {
  return new SignJWT(session as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(JWT_SECRET)
}

export async function verifyJWT(token: string)
: Promise<NucleusSession | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as NucleusSession
  } catch {
    return null
  }
}

export function isAllowedUser(open_id: string)
: { allowed: boolean, user?: typeof ALLOWED_USERS[0] } {
  const user = ALLOWED_USERS.find(u => u.open_id === open_id)
  return { allowed: !!user, user }
}

export function getLarkOAuthURL(state = 'browser_login'): string {
  const params = new URLSearchParams({
    app_id: process.env.LARK_APP_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/lark/callback`,
    scope: 'im:message im:message.send_as_user im:chat im:chat.members:read',
    response_type: 'code',
    state
  })
  return `https://open.larksuite.com/open-apis/authen/v1/authorize?${params}`
}
```

---

## Auth Callback Route

Update: app/api/auth/lark/callback/route.ts

```typescript
// Handles both:
// 1. Lark Web App SSO (state=lark_sso)
// 2. Browser OAuth flow (state=browser_login)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const redirectPath = searchParams.get('redirect') ?? '/'

  if (!code) {
    return Response.redirect(`${APP_URL}/auth/login?error=no_code`)
  }

  // Exchange code for tokens
  const tokenRes = await fetch(
    'https://open.larksuite.com/open-apis/authen/v1/oidc/access_token',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(
          `${LARK_APP_ID}:${LARK_APP_SECRET}`
        ).toString('base64')}`
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code
      })
    }
  )

  const tokenData = await tokenRes.json()

  if (!tokenData.data?.access_token) {
    return Response.redirect(`${APP_URL}/auth/login?error=token_failed`)
  }

  const { access_token, open_id, name, expires_in, refresh_token } =
    tokenData.data

  // Check if user is allowed
  const { allowed, user } = isAllowedUser(open_id)
  if (!allowed) {
    return Response.redirect(`${APP_URL}/auth/denied`)
  }

  // Store tokens in lark_tokens table (for sending messages as Lee)
  await supabaseAdmin.from('lark_tokens').upsert({
    token_type: 'user_access_token',
    app_id: LARK_APP_ID,
    token_value: access_token,
    expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
    user_open_id: open_id,
    is_active: true
  }, { onConflict: 'token_type,user_open_id' })

  if (refresh_token) {
    await supabaseAdmin.from('lark_tokens').upsert({
      token_type: 'refresh_token',
      app_id: LARK_APP_ID,
      token_value: refresh_token,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      user_open_id: open_id,
      is_active: true
    }, { onConflict: 'token_type,user_open_id' })
  }

  // Create JWT session
  const session: NucleusSession = {
    open_id,
    name: user!.name,
    role: user!.role,
    lark_access_token: access_token,
    lark_token_expires_at: Date.now() + expires_in * 1000,
    session_expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
    issued_at: Date.now()
  }

  const jwt = await createSessionJWT(session)

  // Set cookie and redirect
  const response = Response.redirect(`${APP_URL}${redirectPath}`)
  const cookieOptions = [
    `nucleus_session=${jwt}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${7 * 24 * 60 * 60}` // 7 days
  ].join('; ')

  response.headers.set('Set-Cookie', cookieOptions)
  return response
}
```

---

## Login Page

Create: app/auth/login/page.tsx

```
Clean, minimal page. No app UI around it.

┌──────────────────────────────────────────┐
│                                          │
│          N                               │
│   BeLive Nucleus                         │
│   Operational Intelligence               │
│                                          │
│   ┌──────────────────────────────────┐   │
│   │  🔐 Private System               │   │
│   │                                  │   │
│   │  Login with your Lark account    │   │
│   │  to access BeLive Nucleus.       │   │
│   │                                  │   │
│   │  [Login with Lark →]            │   │
│   └──────────────────────────────────┘   │
│                                          │
│   Or open Nucleus directly in Lark       │
│   for automatic login.                   │
│                                          │
└──────────────────────────────────────────┘

Design:
  Background: #080E1C
  Card: #0D1525 with border #1A2035
  Button: #F2784B (coral), white text
  "N" logo: coral, same as sidebar

Error states:
  ?error=no_code → "Login failed. Please try again."
  ?error=token_failed → "Lark authentication failed."
```

---

## Access Denied Page

Create: app/auth/denied/page.tsx

```
┌──────────────────────────────────────────┐
│          N                               │
│   BeLive Nucleus                         │
│                                          │
│   🚫 Access Denied                      │
│                                          │
│   This is a private system for          │
│   BeLive Group leadership only.          │
│                                          │
│   Your Lark account does not have        │
│   permission to access Nucleus.          │
│                                          │
│   If you believe this is an error,       │
│   contact Lee Seng Hee directly.         │
│                                          │
└──────────────────────────────────────────┘
```

---

## Logout Route

Create: app/api/auth/logout/route.ts

```typescript
export async function POST() {
  const response = Response.redirect(`${APP_URL}/auth/login`)
  response.headers.set('Set-Cookie',
    'nucleus_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
  )
  return response
}
```

Add logout button to Settings page sidebar bottom.

---

## Update Settings Page

Update: app/(dashboard)/settings/page.tsx

Show authenticated user info at top:

```
┌─────────────────────────────────────────┐
│ Logged in as                            │
│ 👤 Lee Seng Hee                         │
│ Via Lark SSO · Session expires 12 Apr   │
│ [Logout]                                │
└─────────────────────────────────────────┘
```

---

## Lark Developer Console Configuration

After building, configure in Lark Developer Console:

**Features → Web App → Desktop homepage:**
```
https://belive-nucleus.vercel.app
```

**Features → Web App → Mobile homepage:**
```
https://belive-nucleus.vercel.app
```

**How to launch page:** New tab in Lark (Recommended)

The URL Lark sends when opening:
```
https://belive-nucleus.vercel.app?code=xxx&state=lark_sso
```

Middleware catches the code → exchanges → logs Lee in automatically.

---

## Environment Variables

### Add to .env.local

```bash
JWT_SECRET=generate_a_strong_random_string_here_min_32_chars
NEXT_PUBLIC_APP_URL=https://belive-nucleus.vercel.app
```

### Add to Vercel

```bash
vercel env add JWT_SECRET production
# Enter a strong random string — generate with:
# openssl rand -base64 32

vercel env add NEXT_PUBLIC_APP_URL production <<< "https://belive-nucleus.vercel.app"
```

---

## Dependencies to Install

```bash
npm install jose
# jose is the JWT library for Next.js edge runtime
# Compatible with Vercel Edge Functions and middleware
```

---

## Files to Create

```
middleware.ts                          ← Next.js middleware (root)
lib/auth.ts                            ← JWT + user validation
lib/types.ts (update)                  ← Add NucleusSession type
app/auth/login/page.tsx                ← Login page
app/auth/denied/page.tsx               ← Access denied page
app/api/auth/logout/route.ts           ← Logout handler
```

## Files to Update

```
app/api/auth/lark/callback/route.ts   ← Handle SSO + OAuth + store tokens
app/(dashboard)/settings/page.tsx     ← Show user info + logout
components/layout/Sidebar.tsx          ← Show user name + logout button
```

---

## Security Considerations

```
✅ JWT signed with strong secret (HS256)
✅ HTTP-only cookie (JavaScript cannot read it)
✅ Secure flag (HTTPS only)
✅ SameSite=Lax (CSRF protection)
✅ 7-day expiry (balanced security/convenience)
✅ open_id allowlist (not just any Lark user)
✅ Webhook routes stay public (Lark needs to reach them)
✅ Cron routes protected by NUCLEUS_SECRET (not session)
✅ Access denied page for unauthorized users
✅ Tokens stored in Supabase (not in cookie directly)
```

---

## Testing Plan

### Step 1 — Environment
```
Add JWT_SECRET to .env.local and Vercel
Add NEXT_PUBLIC_APP_URL to both
npm install jose
```

### Step 2 — Browser OAuth flow
```
1. Open belive-nucleus.vercel.app in incognito
2. Should redirect to /auth/login
3. Click "Login with Lark"
4. Lark OAuth → authorize
5. Should redirect to dashboard
6. Check cookie: nucleus_session exists
7. Refresh page → stays logged in
```

### Step 3 — Session protection
```
1. Open DevTools → Application → Cookies
2. nucleus_session should be HttpOnly (not readable by JS)
3. Delete cookie manually
4. Refresh → redirects to /auth/login
```

### Step 4 — Lark Web App SSO
```
1. In Lark Developer Console:
   Features → Web App → Desktop homepage:
   https://belive-nucleus.vercel.app
   Save → Create Version → Publish

2. Open Lark desktop
3. Find BeLive Nucleus in sidebar/app list
4. Click → should open Nucleus
5. Should auto-login without any button click
6. Should land directly on dashboard
```

### Step 5 — Access control
```
1. Have someone else (different Lark account) try to access
2. Should see /auth/denied page
3. Should not see any Nucleus data
```

### Step 6 — Logout
```
1. Click logout in Settings
2. Should redirect to /auth/login
3. Cookie should be cleared
4. Going to /command should redirect to /auth/login
```

### Step 7 — Deploy and test production
```
vercel --prod
Repeat Steps 2-6 on production URL
```

---

## Done Criteria

- [ ] jose installed
- [ ] JWT_SECRET set in .env.local and Vercel
- [ ] middleware.ts protects all routes except public ones
- [ ] /auth/login page renders correctly (dark theme)
- [ ] /auth/denied page renders correctly
- [ ] Login with Lark button works in browser
- [ ] OAuth callback exchanges code and creates session
- [ ] Session cookie is HttpOnly + Secure
- [ ] Session persists across page refreshes (7 days)
- [ ] Only Lee's open_id can access (others see /auth/denied)
- [ ] Lark Web App configured in Developer Console
- [ ] Opening Nucleus from Lark auto-logs in as Lee
- [ ] No login screen when opening from Lark
- [ ] Lark tokens stored in lark_tokens table after SSO
- [ ] Settings page shows "Logged in as Lee Seng Hee"
- [ ] Logout clears cookie and redirects to /auth/login
- [ ] Webhook routes still work (public, no auth needed)
- [ ] Cron routes still work (NUCLEUS_SECRET, no session needed)
- [ ] Zero TypeScript errors
- [ ] Deployed to production
