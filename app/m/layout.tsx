'use client'

import { BottomNav } from '@/components/mobile/BottomNav'
import { MobileStatusBar } from '@/components/mobile/MobileStatusBar'
import { PushPrompt } from '@/components/mobile/PushPrompt'

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col bg-[#080E1C] overflow-hidden" style={{ height: '100dvh' }}>
      <MobileStatusBar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(56px + env(safe-area-inset-bottom))' }}>
        {children}
      </main>
      <BottomNav />
      <PushPrompt />
    </div>
  )
}
