import Link from 'next/link'
import { getLarkOAuthURL } from '@/lib/auth'

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; redirect?: string }> }) {
  const oauthUrl = getLarkOAuthURL('browser_login')

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

          <p className="text-xs text-[#8A9BB8] mb-6">
            Login with your Lark account to access BeLive Nucleus.
          </p>

          <a
            href={oauthUrl}
            className="flex items-center justify-center gap-2 w-full h-10 rounded-lg bg-[#F2784B] text-white text-sm font-medium hover:bg-[#E0673D] transition-colors"
          >
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
