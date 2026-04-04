# Skill: Supabase Realtime

## Client Setup
```typescript
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useRealtimeDecisions() {
  const [decisions, setDecisions] = useState<Decision[]>([])

  useEffect(() => {
    // Initial fetch
    supabase
      .from('decisions')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setDecisions(data)
      })

    // Subscribe to changes
    const channel = supabase
      .channel('decisions-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'decisions' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setDecisions(prev => [payload.new as Decision, ...prev])
          }
          if (payload.eventType === 'UPDATE') {
            setDecisions(prev =>
              prev.map(d => d.id === payload.new.id ? payload.new as Decision : d)
            )
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return decisions
}
```

## Rules
- Always unsubscribe on unmount
- Always do initial fetch before subscribing
- Use for decisions table and events table in Nucleus
- Table must have realtime enabled in migration
