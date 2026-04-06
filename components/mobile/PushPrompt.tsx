'use client'

import { useState, useEffect } from 'react'
import { BottomSheet } from './BottomSheet'
import { requestPushPermission } from '@/lib/push-notifications'

export function PushPrompt() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) return
    if (Notification.permission !== 'default') return
    const dismissed = sessionStorage.getItem('nucleus_push_dismissed')
    if (dismissed) return
    const t = setTimeout(() => setShow(true), 3000)
    return () => clearTimeout(t)
  }, [])

  const handleEnable = async () => {
    await requestPushPermission()
    setShow(false)
  }

  const handleDismiss = () => {
    sessionStorage.setItem('nucleus_push_dismissed', '1')
    setShow(false)
  }

  return (
    <BottomSheet isOpen={show} onClose={handleDismiss}>
      <div className="p-5 text-center">
        <span className="text-3xl">🔔</span>
        <p className="text-[17px] font-semibold text-[#E8EEF8] mt-3">Stay informed on the move</p>
        <p className="text-[13px] text-[#8A9BB8] mt-2 mb-4">
          Enable notifications to receive:<br />
          • P1 alerts instantly<br />
          • New reports ready to send<br />
          • Queue updates
        </p>
        <div className="flex gap-2">
          <button onClick={handleDismiss} className="flex-1 h-11 rounded-[10px] bg-[#111D30] text-[13px] text-[#8A9BB8]">Not now</button>
          <button onClick={handleEnable} className="flex-1 h-11 rounded-[10px] bg-[#F2784B] text-white text-[14px] font-semibold">Enable Notifications</button>
        </div>
      </div>
    </BottomSheet>
  )
}
