'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const OAUTH_URL = `https://open.larksuite.com/open-apis/authen/v1/authorize?app_id=cli_a95beb5592f8ded0&redirect_uri=${encodeURIComponent('https://belive-nucleus.vercel.app/api/auth/lark/callback')}&scope=im:message%20im:chat%20im:chat.members:read&response_type=code&state=browser_login`

function LoginContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  useEffect(() => {
    // Detect if running inside Lark — auto-redirect to OAuth (no login button needed)
    const ua = navigator.userAgent.toLowerCase()
    const isLark = ua.includes('lark') || ua.includes('feishu')
    if (isLark && !error) {
      window.location.href = OAUTH_URL
    }
  }, [error])

  return (
    <div className="min-h-screen bg-[#080E1C] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[#F2784B] rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">N</span>
          </div>
          <h1 className="text-xl font-semibold text-[#E8EEF8]">BeLive Nucleus</h1>
          <p className="text-sm text-[#4B5A7A] mt-1">Operational Intelligence</p>
        </div>

        <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm">🔐</span>
            <span className="text-sm font-medium text-[#E8EEF8]">Private System</span>
          </div>

          {error && (
            <p className="text-xs text-[#E05252] mb-4">
              {error === 'no_code' ? 'Login failed. Please try again.' :
               error === 'token_failed' ? 'Lark authentication failed.' :
               'An error occurred. Please try again.'}
            </p>
          )}

          <p className="text-xs text-[#8A9BB8] mb-6">
            Login with your Lark account to access BeLive Nucleus.
          </p>

          <a href={OAUTH_URL}
            className="flex items-center justify-center gap-2 w-full h-10 rounded-lg bg-[#F2784B] text-white text-sm font-medium hover:bg-[#E0673D] transition-colors">
            Login with Lark →
          </a>
        </div>

        <p className="text-center text-[10px] text-[#2A3550] mt-4">
          Or open Nucleus directly in Lark for automatic login.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#080E1C] flex items-center justify-center">
        <p className="text-[#4B5A7A] text-sm">Authenticating...</p>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
