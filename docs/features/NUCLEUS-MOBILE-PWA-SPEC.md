# Nucleus Mobile — PWA Field Command Spec v1.0

**Feature:** BeLive Nucleus Mobile PWA
**Routes:** /m/* (mobile-specific) + auto-detect redirect
**Platform:** Progressive Web App — iOS Safari "Add to Home Screen"
**Status:** Planned
**Author:** Lee Seng Hee
**Date:** April 2026

---

## Philosophy

```
Desktop = War Room
  Dense information. Keyboard shortcuts.
  Lee is at his desk. Full control mode.
  See everything. Act on anything.

Mobile = Field Command Terminal
  One mission at a time. Thumb only.
  Lee is moving. One hand. Often in motion.
  Surface only what needs him NOW.
  One thumb. One decision. Done.

The mobile app is NOT a shrunken desktop.
It is a completely different instrument
for the same commander in a different context.
```

---

## Confirmed Decisions

| Question | Decision |
|----------|----------|
| Queue interaction | Swipe-to-approve card flow |
| Build approach | Dedicated PWA at /m/* routes |
| Push notifications | Yes — P1 alerts, new queue items |
| Platform | iOS Safari PWA (Add to Home Screen) |

---

## PWA Configuration

### next.config.js additions

```javascript
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/belive-nucleus\.vercel\.app\/m\/.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'mobile-pages',
        expiration: { maxEntries: 20, maxAgeSeconds: 3600 }
      }
    }
  ]
})
```

Install: `npm install next-pwa`

### public/manifest.json

```json
{
  "name": "BeLive Nucleus",
  "short_name": "Nucleus",
  "description": "BeLive Field Command Terminal",
  "start_url": "/m",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#080E1C",
  "theme_color": "#080E1C",
  "icons": [
    {
      "src": "/icons/nucleus-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/nucleus-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

### app/layout.tsx — add to <head>

```html
<link rel="manifest" href="/manifest.json" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Nucleus" />
<link rel="apple-touch-icon" href="/icons/nucleus-192.png" />
<meta name="theme-color" content="#080E1C" />
```

### Auto-detect and redirect

In middleware.ts, add mobile detection:

```typescript
// Detect mobile browsers
function isMobile(userAgent: string): boolean {
  return /iPhone|iPad|iPod|Android/i.test(userAgent)
}

// In middleware:
const ua = request.headers.get('user-agent') ?? ''
const mobile = isMobile(ua)
const path = request.nextUrl.pathname

// If mobile user hits desktop routes → redirect to /m equivalent
if (mobile && !path.startsWith('/m') && !path.startsWith('/api')) {
  const mobileMap: Record<string, string> = {
    '/': '/m',
    '/command': '/m/queue',
    '/clusters': '/m/clusters',
    '/briefings': '/m/reports',
  }
  const mobilePath = mobileMap[path] ?? '/m'
  return NextResponse.redirect(new URL(mobilePath, request.url))
}

// If desktop user hits /m routes → redirect to desktop
if (!mobile && path.startsWith('/m')) {
  return NextResponse.redirect(new URL('/', request.url))
}
```

---

## Mobile App Structure

```
app/m/                           ← mobile root
  layout.tsx                     ← mobile shell (bottom nav, no sidebar)
  page.tsx                       ← Tab 1: Urgent
  queue/
    page.tsx                     ← Tab 2: Queue (swipe to decide)
  clusters/
    page.tsx                     ← Tab 3: Cluster health
  reports/
    page.tsx                     ← Tab 4: Reports

components/mobile/
  MobileShell.tsx                ← bottom nav + status bar
  BottomNav.tsx                  ← 4-tab navigation
  UrgentFeed.tsx                 ← Tab 1 content
  QueueCard.tsx                  ← single swipeable decision card
  QueueSwiper.tsx                ← card stack + swipe engine
  ClusterDotRow.tsx              ← 11 colored dots overview
  ClusterCard.tsx                ← cluster list card
  ClusterSheet.tsx               ← bottom sheet cluster detail
  ReportCard.tsx                 ← single report card
  ReportSheet.tsx                ← bottom sheet report reader
  ConfirmSheet.tsx               ← send confirmation bottom sheet
  EditSheet.tsx                  ← message edit textarea sheet
  PushNotificationPrompt.tsx     ← ask for push permission
```

---

## Design System — Mobile Adaptations

Same color tokens as desktop. Different sizing:

```css
/* Mobile typography */
--text-xs:   11px;   /* metadata, timestamps */
--text-sm:   13px;   /* secondary content */
--text-base: 15px;   /* body — larger than desktop for readability */
--text-md:   17px;   /* card titles */
--text-lg:   22px;   /* section headers */
--text-xl:   32px;   /* stat numbers */

/* Touch targets — minimum 44×44pt (Apple HIG) */
--touch-min: 44px;

/* Thumb zone */
--safe-bottom: env(safe-area-inset-bottom); /* iPhone home indicator */

/* Bottom nav height */
--bottom-nav-height: calc(56px + var(--safe-bottom));

/* Card spacing */
--card-padding: 16px;
--card-radius: 14px;
--card-gap: 12px;
```

---

## app/m/layout.tsx — Mobile Shell

```tsx
'use client'
import { BottomNav } from '@/components/mobile/BottomNav'
import { MobileStatusBar } from '@/components/mobile/MobileStatusBar'

export default function MobileLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        height: '100dvh',          // dynamic viewport height (iOS)
        display: 'flex',
        flexDirection: 'column',
        background: '#080E1C',
        overflow: 'hidden',
      }}
    >
      {/* Status bar — read only, no interactions */}
      <MobileStatusBar />

      {/* Scrollable content area */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',  // momentum scrolling iOS
          paddingBottom: 'var(--bottom-nav-height)',
        }}
      >
        {children}
      </main>

      {/* Bottom navigation — always visible */}
      <BottomNav />
    </div>
  )
}
```

---

## components/mobile/MobileStatusBar.tsx

```tsx
// Top status bar — READ ONLY, no taps
// Height: 52px
// Shows: LIVE dot + "Nucleus" + time + notification bell

export function MobileStatusBar() {
  return (
    <div style={{
      height: 52,
      padding: '0 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid #1A2035',
      flexShrink: 0,
    }}>
      {/* Left: identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#4BF2A2',
          boxShadow: '0 0 8px #4BF2A2',
          animation: 'pulse 2s infinite'
        }} />
        <span style={{
          fontFamily: 'JetBrains Mono',
          fontSize: 13,
          fontWeight: 600,
          color: '#E8EEF8',
          letterSpacing: 0.5
        }}>
          NUCLEUS
        </span>
      </div>

      {/* Right: time + bell */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <LiveTime />
        <NotificationBell />
      </div>
    </div>
  )
}
```

---

## components/mobile/BottomNav.tsx

```tsx
// 4 tabs. All interactive elements at thumb level.
// Tab badges update via Supabase realtime.

const TABS = [
  {
    key: 'urgent',
    label: 'Urgent',
    icon: Zap,
    href: '/m',
    badgeKey: 'p1_count'    // red badge
  },
  {
    key: 'queue',
    label: 'Queue',
    icon: ListChecks,
    href: '/m/queue',
    badgeKey: 'awaiting_count'  // amber badge
  },
  {
    key: 'clusters',
    label: 'Clusters',
    icon: Building2,
    href: '/m/clusters',
    badgeKey: 'critical_clusters'  // red badge if any RED
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: FileText,
    href: '/m/reports',
    badgeKey: 'draft_reports'  // amber badge
  },
]

// Tab styling:
// Active: coral icon + coral label + top border 2px coral
// Inactive: muted icon + muted label
// Badge: absolute positioned, top-right of icon
//   Red badge (P1/critical): #E05252
//   Amber badge (queue/drafts): #E8A838
//   Max badge display: 99+
```

---

## Tab 1 — Urgent (/m)

### Layout

```
┌─────────────────────────────────────────┐  ← 375px wide (iPhone 14)
│  ● NUCLEUS              10:32  🔔       │  52px status bar
├─────────────────────────────────────────┤
│                                         │
│  Mon, 6 Apr · Good morning, Lee.        │  greeting
│                                         │
│  ┌─────────────────────────────────┐    │  stat summary card
│  │  🔴 3   🟡 12   🟢 5          │    │
│  │  P1 now  Queue  Resolved        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  CRITICAL — ACT NOW ─────────────────   │  section header
│                                         │
│  [P1 card] [P1 card] [P1 card]          │  scrollable
│                                         │
│  AWAITING YOUR DECISION ─────────────   │
│  12 incidents · [Clear Queue →]         │
│                                         │
├─────────────────────────────────────────┤
│  ⚡Urgent  📋Queue  🏢Clusters  📄      │  56px bottom nav
└─────────────────────────────────────────┘
```

### P1 Card Design

```tsx
// Each critical incident card
// Height: auto (min 100px)
// Full width with 16px horizontal margin

<div style={{
  background: '#0D1525',
  border: '1px solid #E05252',
  borderLeft: '4px solid #E05252',
  borderRadius: 14,
  padding: 16,
  margin: '0 16px 12px',
}}>
  {/* Top row */}
  <div>
    <span>🔴 P1</span>
    <ClusterBadge cluster="C11" />
    <span>163 days</span>  {/* age, in red if > 60 days */}
  </div>

  {/* Title */}
  <div style={{ fontSize: 15, fontWeight: 600, color: '#E8EEF8', margin: '8px 0' }}>
    Epic Residences — Pipe burst flooding
  </div>

  {/* Unit + detail */}
  <div style={{ fontSize: 13, color: '#8A9BB8' }}>
    Unit 11-01 · Aliya · SILENT 5h
  </div>

  {/* Action button — right aligned, thumb zone */}
  <button style={{
    marginTop: 12,
    width: '100%',
    height: 44,                    // min touch target
    background: '#E05252',
    borderRadius: 10,
    color: 'white',
    fontSize: 14,
    fontWeight: 600,
  }}>
    Act Now →
  </button>
</div>
```

Tap "Act Now →" → opens QueueSwiper focused on this specific incident.

### Stat Summary Card

```tsx
// 3 columns: P1 | Queue | Resolved
// Tap P1 → goes to /m (filters to P1)
// Tap Queue → goes to /m/queue
// Tap Resolved → goes to /m/queue?status=resolved

<div style={{
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr',
  background: '#0D1525',
  border: '1px solid #1A2035',
  borderRadius: 14,
  margin: '12px 16px',
  overflow: 'hidden',
}}>
  <StatCell value={3} label="P1 Now" color="#E05252" />
  <StatCell value={12} label="Queue" color="#E8A838" />
  <StatCell value={5} label="Resolved" color="#4BF2A2" />
</div>
```

---

## Tab 2 — Queue (/m/queue)

### The Swipe Engine

```tsx
'use client'
// Uses: react-spring for physics-based swipe animation

import { useSpring, animated } from '@react-spring/web'
import { useDrag } from '@use-gesture/react'

const SWIPE_THRESHOLD = 120  // px to trigger action
const ROTATION_FACTOR = 0.1  // card tilt on drag

export function QueueSwiper({ incidents }: { incidents: Incident[] }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [action, setAction] = useState<'approve' | 'skip' | null>(null)

  const [{ x, rotate, opacity }, api] = useSpring(() => ({
    x: 0, rotate: 0, opacity: 1
  }))

  const bind = useDrag(({ active, movement: [mx], last }) => {
    if (active) {
      // Card follows finger
      api.start({
        x: mx,
        rotate: mx * ROTATION_FACTOR,
        opacity: 1 - Math.abs(mx) / 400,
        immediate: true
      })

      // Show approve/skip indicator
      if (mx > 60) setAction('approve')
      else if (mx < -60) setAction('skip')
      else setAction(null)
    }

    if (last) {
      if (mx > SWIPE_THRESHOLD) {
        // APPROVE: fly card right
        api.start({ x: 500, rotate: 30, opacity: 0 })
        handleApprove(incidents[currentIndex])
        setTimeout(() => {
          setCurrentIndex(i => i + 1)
          api.start({ x: 0, rotate: 0, opacity: 1, immediate: true })
        }, 300)
      } else if (mx < -SWIPE_THRESHOLD) {
        // SKIP: fly card left
        api.start({ x: -500, rotate: -30, opacity: 0 })
        handleSkip(incidents[currentIndex])
        setTimeout(() => {
          setCurrentIndex(i => i + 1)
          api.start({ x: 0, rotate: 0, opacity: 1, immediate: true })
        }, 300)
      } else {
        // Snap back
        api.start({ x: 0, rotate: 0, opacity: 1 })
        setAction(null)
      }
    }
  }, {
    filterTaps: true,
    axis: 'x',
  })

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      {/* Approve indicator (shows on right swipe) */}
      <ApproveIndicator visible={action === 'approve'} />

      {/* Skip indicator (shows on left swipe) */}
      <SkipIndicator visible={action === 'skip'} />

      {/* The card */}
      <animated.div
        {...bind()}
        style={{ x, rotate, opacity, touchAction: 'none' }}
      >
        <QueueCard incident={incidents[currentIndex]} />
      </animated.div>

      {/* Next card peeking behind */}
      {incidents[currentIndex + 1] && (
        <div style={{ position: 'absolute', zIndex: -1, transform: 'scale(0.95)' }}>
          <QueueCard incident={incidents[currentIndex + 1]} faded />
        </div>
      )}
    </div>
  )
}
```

Install: `npm install @react-spring/web @use-gesture/react`

### QueueCard Component

```
┌─────────────────────────────────────────┐
│                                         │
│  ← SKIP              APPROVE →          │  gesture hints (fade in on drag)
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  C11  ·  COO  ·  P1  ·  SILENT 3h     │  incident metadata
│                                         │
│  ──────────────────────────────────     │
│                                         │
│  Inter-floor leaking urgent             │  title — large, readable
│  repair — M Vertica                     │
│                                         │
│  Unit B-23A-10 · Mardhiah              │  detail
│  87 days · SLA breached                 │
│                                         │
│  ──────────────────────────────────     │
│                                         │
│  AI PROPOSED ACTION                     │  section header
│                                         │
│  "Mardhiah — BLV-RQ-26000514 for       │  proposal text
│  M Vertica. Urgent inter-floor leak    │
│  B-23A-10. Contact tenant +            │
│  contractor today. Update me by 6pm."  │
│                                         │
│  Confidence: ████████░░  92%           │  confidence bar
│                                         │
├─────────────────────────────────────────┤
│  ████░░░░░░░░  3 of 12                 │  progress bar
├─────────────────────────────────────────┤
│                                         │
│  [✏️ Edit]  [✓ Approve & Send]  [Skip] │  action buttons — THUMB ZONE
│                                         │
│          [✗ Discard]                   │  secondary action
│                                         │
└─────────────────────────────────────────┘
```

### Approve/Skip Visual Indicators

During drag:
```
Swiping right → green APPROVE badge fades in on left side of card
Swiping left  → amber SKIP badge fades in on right side of card

APPROVE badge:
  background: #4BF2A2
  text: "APPROVE" in bold
  icon: ✓
  opacity: 0 → 1 as drag increases

SKIP badge:
  background: #E8A838
  text: "SKIP"
  icon: →
```

### Empty State

```
┌─────────────────────────────────────────┐
│                                         │
│           ✓                             │
│                                         │
│      Queue cleared!                     │
│                                         │
│  Nothing waiting for your decision.     │
│                                         │
│  [↻ Refresh]                           │
│                                         │
└─────────────────────────────────────────┘
```

### Edit Sheet (bottom sheet)

Opens when Lee taps [✏️ Edit]:

```tsx
// Bottom sheet slides up 75% of screen height
// Textarea for editing proposal
// iOS keyboard pushes content up automatically

<BottomSheet height="75vh">
  <div>
    {/* Handle */}
    <div style={{ width: 40, height: 4, background: '#1A2035',
      borderRadius: 2, margin: '12px auto' }} />

    {/* Header */}
    <div>Edit Message · C11 Group</div>

    {/* Editable textarea */}
    <textarea
      defaultValue={incident.ai_proposal}
      style={{
        width: '100%',
        minHeight: 160,
        background: '#0D1525',
        border: '1px solid #2E4070',
        borderRadius: 10,
        padding: 14,
        color: '#E8EEF8',
        fontSize: 15,
        lineHeight: 1.6,
        resize: 'none',
      }}
    />

    {/* Char count */}
    <div style={{ textAlign: 'right', color: '#4B5A7A', fontSize: 12 }}>
      {charCount} chars
    </div>

    {/* Sending to */}
    <div>Sending to: C11 — M Vertica Group</div>

    {/* Actions */}
    <button>✓ Send Edited Message</button>
    <button>Cancel</button>
  </div>
</BottomSheet>
```

### Confirm Sheet (bottom sheet)

Opens when Lee taps [✓ Approve & Send]:

```
┌─────────────────────────────────────────┐
│  ────  (drag handle)                    │
│                                         │
│  Sending to:                            │
│                                         │
│  👥  C11 — M Vertica Group             │
│                                         │
│  Preview:                               │
│  "Mardhiah — BLV-RQ-26000514 for       │
│  M Vertica..."                          │
│                                         │
│  [Cancel]        [✓ Send Now]          │  ← large buttons, thumb zone
│                                         │
└─────────────────────────────────────────┘
```

---

## Tab 3 — Clusters (/m/clusters)

### Layout

```
┌─────────────────────────────────────────┐
│  ● NUCLEUS              10:32  🔔       │
├─────────────────────────────────────────┤
│  Cluster Health          [↻ Scan All]  │
│                                         │
│  ● ● ● ● ● ● ● ● ● ● ●               │  dot row
│  C1 C2 C3 C4 C5 C6 C7 C8 C9 10 11    │
│  (scroll horizontally if needed)        │
│                                         │
│  11 critical · 0 green                 │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  [C1 card]                              │
│  [C2 card]                              │
│  [C3 card]                              │
│  ... scrollable                         │
│                                         │
├─────────────────────────────────────────┤
│  ⚡Urgent  📋Queue  🏢Clusters  📄      │
└─────────────────────────────────────────┘
```

### Cluster Dot Row

```tsx
// 11 colored dots, horizontally scrollable
// Tap any dot → scrolls list to that cluster AND opens sheet

const DOT_COLORS = {
  RED: '#E05252',
  YELLOW: '#E8A838',
  GREEN: '#4BF2A2',
}

// Each dot: 28px diameter, colored by health_status
// Active (tapped): 32px, white ring around it
// Labels: C1-C11 below each dot, 10px mono font
```

### Cluster List Card

```tsx
// Compact card, full width, tap → opens bottom sheet

<div style={{
  background: '#0D1525',
  border: `1px solid ${severityColor}`,
  borderLeft: `4px solid ${severityColor}`,
  borderRadius: 14,
  padding: '14px 16px',
  margin: '0 16px 10px',
}}>
  {/* Header row */}
  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
    <div>
      <ClusterBadge cluster="C11" />
      <span>M Vertica</span>
    </div>
    <SeverityDot color={severityColor} />
  </div>

  {/* 4 metrics in a row */}
  <div style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    marginTop: 10,
    gap: 4,
  }}>
    <Metric icon="🔧" label="Maint" value={98} overdue={62} />
    <Metric icon="🧹" label="Clean" value={29} overdue={14} />
    <Metric icon="→" label="In" value={10} overdue={9} />
    <Metric icon="↺" label="Turn" value={45} overdue={61} />
  </div>

  {/* Footer */}
  <div style={{ marginTop: 8, fontSize: 12, color: '#8A9BB8' }}>
    Oldest: 87 days · Mardhiah
  </div>
</div>
```

### Cluster Detail Bottom Sheet

Opens when Lee taps any cluster card.
Height: 70% of screen. Draggable. Dismisses on swipe down.

```
┌─────────────────────────────────────────┐
│  ──── (drag to dismiss)                 │
│                                         │
│  C11 — M Vertica           🔴 CRITICAL  │
│                                         │
│  [🔧 98] [🧹 29] [→10] [↺45]          │  metric pills
│  Maint   Clean   In    Turn             │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  DETAILS                                │
│  IOE: Mardhiah                          │
│  Oldest ticket: 87 days                 │
│  SLA breaches: 12                       │
│  Last standup: 14h ago ⚠️               │
│  Brief sent: Today 08:01am ✓            │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  [↻ Scan C11]  [📋 View Incidents (98)]│
│                                         │
└─────────────────────────────────────────┘
```

[View Incidents] → navigates to /m/queue filtered to C11.
[↻ Scan C11] → triggers scan, shows spinner while running.

---

## Tab 4 — Reports (/m/reports)

### Layout

```
┌─────────────────────────────────────────┐
│  ● NUCLEUS              10:32  🔔       │
├─────────────────────────────────────────┤
│  Reports                                │
│                                         │
│  2 drafts ready                         │
│  [📤 Send All Drafts (2)]              │  ← prominent button
│                                         │
│  DRAFTS ──────────────────────────────  │
│                                         │
│  [Morning Brief card - DRAFT]           │
│  [C11 Standup Brief card - DRAFT]       │
│                                         │
│  SENT TODAY ──────────────────────────  │
│                                         │
│  [C1 Standup - SENT ✓]                 │
│  [C9 Standup - SENT ✓]                 │
│                                         │
│  SCHEDULE ─────────────────────────── │
│  Next: Midday Pulse in 47 min           │
│  Next: EOD Summary in 6h 15m           │
│                                         │
├─────────────────────────────────────────┤
│  ⚡Urgent  📋Queue  🏢Clusters  📄      │
└─────────────────────────────────────────┘
```

### Report Card

```tsx
<div style={{
  background: '#0D1525',
  border: '1px solid #E8A83850',
  borderLeft: '4px solid #E8A838',
  borderRadius: 14,
  padding: 16,
  margin: '0 16px 10px',
}}>
  {/* Header */}
  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
    <div>
      <span>🌅</span>
      <span style={{ fontWeight: 600 }}>Morning Intelligence Briefing</span>
    </div>
    <StatusPill status="DRAFT" />
  </div>

  {/* Meta */}
  <div style={{ fontSize: 12, color: '#8A9BB8', marginTop: 4 }}>
    Generated 12:33pm · Lee DM
  </div>

  {/* Actions */}
  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
    <button style={{ flex: 1, height: 40 }}>👁 Read</button>
    <button style={{ flex: 1, height: 40, background: '#F2784B' }}>
      ✓ Send
    </button>
    <button style={{ width: 40, height: 40 }}>✗</button>
  </div>
</div>
```

### Report Reader Bottom Sheet

Opens when Lee taps [👁 Read]:

```
Full-height bottom sheet (95% of screen).
Scrollable content.
Sticky header + sticky footer.

┌─────────────────────────────────────────┐
│  ──── (drag to dismiss)                 │
│  🌅 Morning Brief · DRAFT    [✓ Send]  │  ← sticky header with send button
├─────────────────────────────────────────┤
│                                         │
│  [full report content scrolls here]     │
│                                         │
│  BeLive Property Hub — Morning          │
│  Intelligence Briefing                  │
│  Lee Seng Hee | Monday, 6 Apr 2026     │
│                                         │
│  CRITICAL — ACT NOW                     │
│  Epic Residences (C1) is on fire...    │
│                                         │
│  ... scrollable ...                     │
│                                         │
├─────────────────────────────────────────┤
│  Sending to: Lee DM (Lee Seng Hee)     │  ← sticky footer
│  [Cancel]          [✓ Send Now]        │
└─────────────────────────────────────────┘
```

Send confirmation — same ConfirmSheet pattern as Queue tab.

### Send All Drafts

Tap [📤 Send All Drafts (2)]:

```
ConfirmSheet slides up:

┌─────────────────────────────────────────┐
│  ──── (drag to dismiss)                 │
│                                         │
│  Send 2 reports?                        │
│                                         │
│  🌅 Morning Brief → Lee DM             │
│  📋 C11 Standup → C11 Group            │
│                                         │
│  [Cancel]      [📤 Send All]           │
│                                         │
└─────────────────────────────────────────┘
```

---

## Push Notifications

### Setup: lib/push-notifications.ts

```typescript
// Request permission and save subscription
export async function requestPushPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (!('serviceWorker' in navigator)) return false

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  })

  // Save subscription to Supabase
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription })
  })

  return true
}

// Send push from server (triggered by Nucleus events)
export async function sendPushNotification(params: {
  title: string
  body: string
  url: string
  badge?: number
  tag?: string    // prevents duplicate notifications
}) {
  // Uses web-push library
  // Sends to all active subscriptions for Lee
}
```

Install: `npm install web-push`
Generate VAPID keys: `npx web-push generate-vapid-keys`

### When Push Fires

```typescript
// In lib/incidents.ts — after P1 incident created:
if (incident.priority === 'P1') {
  await sendPushNotification({
    title: `🔴 P1 — ${clusterName}`,
    body: incident.title.slice(0, 80),
    url: '/m',  // opens mobile home tab
    badge: p1Count,
    tag: `p1-${incident.id}`  // deduplicated
  })
}

// In lib/briefings/report-generator.ts — after report generated:
await sendPushNotification({
  title: `📋 ${reportName} ready`,
  body: 'Tap to review and send',
  url: '/m/reports',
  tag: `report-${reportId}`
})

// In queue — when new items arrive (max 1 per 30min, not per item):
await sendPushNotification({
  title: `📋 ${count} items in your queue`,
  body: 'Tap to review',
  url: '/m/queue',
  tag: 'queue-update'  // replaces previous queue notification
})
```

### public/sw.js — Service Worker

```javascript
self.addEventListener('push', (event) => {
  const data = event.data.json()

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/nucleus-192.png',
      badge: '/icons/nucleus-badge-72.png',
      data: { url: data.url },
      tag: data.tag,
      renotify: true,
      requireInteraction: data.priority === 'p1',  // P1 stays until dismissed
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  )
})
```

### Push Permission Prompt

Shows on first mobile visit after login:

```
┌─────────────────────────────────────────┐
│  ──── (drag to dismiss)                 │
│                                         │
│  🔔  Stay informed on the move          │
│                                         │
│  Enable notifications to receive:       │
│  • P1 alerts instantly                  │
│  • New reports ready to send            │
│  • Queue updates                        │
│                                         │
│  [Not now]      [Enable Notifications]  │
│                                         │
└─────────────────────────────────────────┘
```

---

## Bottom Sheet Component

Reusable across all tabs. Uses framer-motion.

```tsx
'use client'
import { motion, AnimatePresence, useDragControls } from 'framer-motion'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  height?: string           // '70vh' | '75vh' | '95vh'
  children: React.ReactNode
}

export function BottomSheet({
  isOpen, onClose, height = '70vh', children
}: BottomSheetProps) {
  const controls = useDragControls()

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.6)',
              zIndex: 100,
            }}
          />

          {/* Sheet */}
          <motion.div
            drag="y"
            dragControls={controls}
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) onClose()
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            style={{
              position: 'fixed',
              bottom: 0, left: 0, right: 0,
              height,
              background: '#0D1525',
              borderRadius: '20px 20px 0 0',
              zIndex: 101,
              overflowY: 'auto',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            {/* Drag handle */}
            <div
              onPointerDown={e => controls.start(e)}
              style={{
                width: 40, height: 4,
                background: '#2E4070',
                borderRadius: 2,
                margin: '12px auto 0',
                cursor: 'grab',
              }}
            />
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

---

## API Routes (Mobile-Specific)

### app/api/m/summary/route.ts

```
GET — Mobile home summary
Returns everything the Urgent tab needs in one call:
{
  p1_incidents: [...],        // max 5, for display
  awaiting_count: number,
  resolved_today: number,
  cluster_summary: [{ cluster, status }],  // for dot row
  draft_reports_count: number
}
```

### app/api/m/queue/route.ts

```
GET — Queue for swipe interface
Returns incidents with status = awaiting_lee
Ordered by: priority (P1 first), then created_at DESC
Includes: ai_proposal, destinations, cluster info
```

### app/api/m/incidents/[id]/decide/route.ts

```
POST — Approve/skip/discard from mobile
Body: { action: 'approve' | 'skip' | 'discard', edited_message?: string }
Same logic as desktop approve endpoint
Returns: { ok: true, next_incident_id? }
```

### app/api/push/subscribe/route.ts

```
POST — Save push subscription
Body: { subscription: PushSubscription }
Saves to push_subscriptions table
```

### app/api/push/send/route.ts

```
POST — Send push notification (internal, server-side only)
Protected by NUCLEUS_SECRET
Body: { title, body, url, tag, priority? }
```

---

## New Table: push_subscriptions

```sql
CREATE TABLE push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  user_id text not null,          -- 'lee' for now
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_name text,               -- 'Lee iPhone 15'
  last_used_at timestamptz,
  active boolean default true
);
```

---

## Files to Create

```
app/m/layout.tsx
app/m/page.tsx                         ← Tab 1: Urgent
app/m/queue/page.tsx                   ← Tab 2: Queue
app/m/clusters/page.tsx               ← Tab 3: Clusters
app/m/reports/page.tsx                ← Tab 4: Reports

components/mobile/MobileShell.tsx
components/mobile/BottomNav.tsx
components/mobile/MobileStatusBar.tsx
components/mobile/UrgentFeed.tsx
components/mobile/StatSummaryCard.tsx
components/mobile/P1Card.tsx
components/mobile/QueueSwiper.tsx
components/mobile/QueueCard.tsx
components/mobile/SwipeIndicator.tsx
components/mobile/ProgressBar.tsx
components/mobile/EditSheet.tsx
components/mobile/ConfirmSheet.tsx
components/mobile/ClusterDotRow.tsx
components/mobile/ClusterCard.tsx
components/mobile/ClusterSheet.tsx
components/mobile/ReportCard.tsx
components/mobile/ReportSheet.tsx
components/mobile/BottomSheet.tsx
components/mobile/PushPrompt.tsx
components/mobile/LiveTime.tsx

lib/push-notifications.ts
public/sw.js
public/manifest.json
public/icons/nucleus-192.png          ← create dark navy icon with N
public/icons/nucleus-512.png
public/icons/nucleus-badge-72.png     ← small red dot icon for notifications

app/api/m/summary/route.ts
app/api/m/queue/route.ts
app/api/m/incidents/[id]/decide/route.ts
app/api/push/subscribe/route.ts
app/api/push/send/route.ts
```

## Files to Update

```
middleware.ts                          ← add mobile detect + redirect
next.config.js                         ← add next-pwa
app/layout.tsx                         ← add PWA meta tags
lib/incidents.ts                       ← trigger push on P1 created
lib/briefings/report-generator.ts     ← trigger push on report generated
```

---

## Testing Plan

### Step 1 — PWA setup
```
npm run build && npm run start
Open http://localhost:3000 on iPhone (use ngrok for HTTPS)
Safari → Share → Add to Home Screen → "Nucleus"
Tap home screen icon → opens fullscreen, no browser chrome
Verify: status bar color matches #080E1C
```

### Step 2 — Auto-redirect
```
Open belive-nucleus.vercel.app on iPhone
Verify: redirects to /m automatically
Open on desktop — stays on / (no redirect)
```

### Step 3 — Urgent tab
```
Open /m on iPhone
Verify: P1 incidents show as red cards
Verify: stat summary shows correct counts
Verify: bottom nav visible and tappable
Tap [Act Now →] → goes to Queue with that incident first
```

### Step 4 — Queue swipe
```
Open /m/queue
Verify: first incident card visible
Drag right → green APPROVE indicator appears
Release past threshold → card flies right, next card appears
Check database: incident status = approved, sent
Drag left → SKIP indicator, card goes to end of queue
Tap [✓ Approve & Send] → ConfirmSheet opens
Confirm → sent, next card
Tap [✏️ Edit] → EditSheet opens, textarea editable
```

### Step 5 — Cluster tab
```
Open /m/clusters
Verify: 11 colored dots at top
Verify: cluster cards list below
Tap any cluster card → BottomSheet opens with detail
Drag sheet down → dismisses
Tap dot → scrolls to cluster card AND opens sheet
```

### Step 6 — Reports tab
```
Open /m/reports
Verify: draft reports show with Send button
Tap [👁 Read] → full report opens in sheet
Tap [✓ Send] → ConfirmSheet → send
Verify: sent report moves to SENT TODAY section
Tap [Send All Drafts] → ConfirmSheet for batch
```

### Step 7 — Push notifications
```
Open /m on iPhone
PushPrompt sheet appears → [Enable Notifications]
iOS asks for permission → Allow
Check push_subscriptions table → new row
Create a P1 incident via Lark test message
Verify: push notification appears on iPhone
Tap notification → opens Nucleus at /m
```

### Step 8 — Offline behavior
```
On iPhone, turn off WiFi
Open Nucleus (from home screen)
Verify: cached pages load (Urgent, Queue)
Turn WiFi back on
Verify: data refreshes automatically
```

---

## Done Criteria

- [ ] PWA manifest configured correctly
- [ ] App installable via Safari "Add to Home Screen"
- [ ] Opens fullscreen (no browser chrome)
- [ ] Dark status bar (#080E1C background)
- [ ] Mobile users auto-redirect to /m
- [ ] Desktop users not redirected
- [ ] /m — Urgent tab loads with P1 cards
- [ ] Stat summary shows correct counts
- [ ] Bottom nav visible with correct badge counts
- [ ] /m/queue — card swipe loads incident card
- [ ] Swipe right → approve → card flies right → next card
- [ ] Swipe left → skip → card goes to end
- [ ] APPROVE/SKIP indicators appear on drag
- [ ] [✓ Approve & Send] → ConfirmSheet → sends
- [ ] [✏️ Edit] → EditSheet → textarea editable → sends edited
- [ ] Progress bar shows current position
- [ ] Empty state when queue cleared
- [ ] /m/clusters — 11 dots show correct colors
- [ ] Cluster cards list with 4 metrics each
- [ ] Tap cluster → BottomSheet opens with detail
- [ ] Swipe down on sheet → dismisses
- [ ] /m/reports — draft reports listed
- [ ] [Read] opens report in full sheet
- [ ] [Send] → confirm → sends
- [ ] [Send All Drafts] → batch confirm → all sent
- [ ] Push notification permission requested on first visit
- [ ] P1 incident → push notification fires on iPhone
- [ ] New report generated → push notification fires
- [ ] Tap notification → opens correct tab
- [ ] All touch targets minimum 44×44pt
- [ ] Thumb zone respected (actions in bottom 45%)
- [ ] Safe area insets respected (iPhone home indicator)
- [ ] Zero TypeScript errors
- [ ] Deployed to production
