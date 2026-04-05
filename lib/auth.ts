import { SignJWT, jwtVerify } from 'jose'
import type { NucleusSession } from './types'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'fallback-dev-secret-change-in-production')

const ALLOWED_USERS = [
  {
    open_id: 'ou_af2a40628719440234aa29656d06d322',
    name: 'Lee Seng Hee',
    role: 'admin' as const,
  },
  {
    // Same user, different open_id from OAuth flow
    open_id: 'ou_75d909e9970e145b53db019efefd09c9',
    name: 'Lee Seng Hee',
    role: 'admin' as const,
  },
  {
    // Same user, open_id from lark-cli
    open_id: 'ou_e5cdd533d4e22a987413ae5fa580d697',
    name: 'Lee Seng Hee',
    role: 'admin' as const,
  },
]

export async function createSessionJWT(session: NucleusSession): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(JWT_SECRET)
}

export async function verifyJWT(token: string): Promise<NucleusSession | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as NucleusSession
  } catch {
    return null
  }
}

export function isAllowedUser(openId: string): { allowed: boolean; user?: (typeof ALLOWED_USERS)[0] } {
  const user = ALLOWED_USERS.find(u => u.open_id === openId)
  return { allowed: !!user, user }
}

export function getLarkOAuthURL(state = 'browser_login'): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://belive-nucleus.vercel.app'
  const params = new URLSearchParams({
    app_id: process.env.LARK_APP_ID ?? 'cli_a95beb5592f8ded0',
    redirect_uri: `${appUrl}/api/auth/lark/callback`,
    scope: 'im:message im:chat im:chat.members:read',
    response_type: 'code',
    state,
  })
  return `https://open.larksuite.com/open-apis/authen/v1/authorize?${params}`
}
