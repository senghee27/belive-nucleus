import { NextResponse } from 'next/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://belive-nucleus.vercel.app'

export async function POST() {
  const response = NextResponse.redirect(`${APP_URL}/auth/login`)
  response.cookies.set('nucleus_session', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}

export async function GET() {
  const response = NextResponse.redirect(`${APP_URL}/auth/login`)
  response.cookies.set('nucleus_session', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}
