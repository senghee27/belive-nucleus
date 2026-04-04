# Skill: UI/UX — BeLive Nucleus Command Center

## The Design Vision
BeLive Nucleus is a war strategist's room. Not a SaaS dashboard.
Not a admin panel. A high-stakes command center where Lee Seng Hee
makes decisions that affect 3,000 rooms and 55+ properties.

Every pixel must communicate: this is serious, real-time, and powerful.
The UI should feel like mission control — dark, precise, alive.

---

## The Golden Rule
> "Information at a glance. Action in one click. Nothing wasted."

If Lee has to search for something — the design failed.
If Lee has to click more than twice to act — the design failed.
If anything on screen doesn't help Lee decide — remove it.

---

## Design Aesthetic: Dark Ops

### The Feel
- NASA mission control meets Bloomberg terminal
- Dark background. Glowing data. Precise typography.
- Everything feels like it's running live, right now
- Calm under pressure — no visual chaos, no clutter
- Data breathes — subtle animations show things are alive

### NOT This
- No cards on white (generic AI aesthetic)
- No rounded pastel cards (consumer app feel)
- No flat boring tables (Excel look)
- No overwhelming charts everywhere (data for data's sake)

---

## Design System Tokens

### Colors
```css
/* Backgrounds — layers of depth */
--bg-base:      #080E1C;   /* deepest background */
--bg-surface:   #0D1525;   /* cards, panels */
--bg-elevated:  #111D30;   /* hover states, modals */
--bg-overlay:   #162038;   /* active selections */

/* Borders */
--border-dim:   #1A2035;   /* subtle dividers */
--border-mid:   #243050;   /* card borders */
--border-lit:   #2E4070;   /* focus rings */

/* Text */
--text-primary:  #E8EEF8;  /* main content */
--text-secondary:#8A9BB8;  /* labels, metadata */
--text-muted:    #4B5A7A;  /* timestamps, hints */
--text-disabled: #2A3550;  /* inactive elements */

/* Accent — use sparingly */
--coral:    #F2784B;        /* primary CTA, BeLive brand */
--coral-dim: #F2784B20;    /* coral backgrounds */

/* Status colors — semantic, always consistent */
--p1:       #E05252;        /* P1 emergency */
--p1-dim:   #E0525220;
--p2:       #E8A838;        /* P2 warning */
--p2-dim:   #E8A83820;
--p3:       #4BB8F2;        /* P3 info */
--p3-dim:   #4BB8F220;
--success:  #4BF2A2;        /* approved, resolved */
--success-dim: #4BF2A215;

/* Agent colors — each agent has identity */
--agent-ceo: #9B6DFF;      /* purple — strategic */
--agent-cfo: #4BB8F2;      /* blue — financial */
--agent-coo: #F2784B;      /* coral — operational */
--agent-cto: #4BF2A2;      /* green — technical */
```

### Typography
```css
/* Import in layout.tsx */
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

--font-body: 'DM Sans', sans-serif;
--font-mono: 'JetBrains Mono', monospace;

/* Scale */
--text-xs:  10px;   /* timestamps, metadata, labels */
--text-sm:  12px;   /* secondary content */
--text-base: 14px;  /* body, table content */
--text-md:  16px;   /* section headings */
--text-lg:  20px;   /* page titles */
--text-xl:  28px;   /* stat numbers */
--text-2xl: 36px;   /* hero numbers */
```

### Spacing
```
Use 4px base grid: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64
Consistent padding on cards: 20px 24px
Consistent gap between sections: 16px or 24px
```

### Border Radius
```
Panels/Cards:  10px or 12px
Buttons:       8px
Badges/Pills:  4px or 9999px (fully rounded)
Input fields:  8px
```

---

## Layout Principles

### 1. The F-Pattern — Eyes Go Top-Left First
```
┌─────────────────────────────────────────┐
│ HEADER — Identity + Live status          │ ← always visible
├──────────┬──────────────────────────────┤
│          │ CRITICAL INFO — Top of page  │ ← P1 alerts, blockers
│ SIDEBAR  │──────────────────────────────│
│          │ PRIMARY CONTENT — Data table │ ← decisions, events
│          │──────────────────────────────│
│          │ SUPPORTING — Charts, memory  │ ← secondary info
└──────────┴──────────────────────────────┘
```

### 2. Progressive Disclosure
- Overview first → click to expand detail
- Never show all data at once
- Drawer pattern for detail (slides in from right)
- Modal only for critical confirmations

### 3. Information Hierarchy Per Screen
Every screen has exactly ONE primary action.
Everything else supports that action.
P1 alerts always surface above everything.

### 4. Sidebar — Navigation Only
```
Width: 56px collapsed / 200px expanded
Contains: icons + labels for main sections
Never: data, metrics, notifications
Always visible: current section indicator
```

---

## Component Patterns

### Stat Card
```tsx
// Large number. One label. One supporting context.
// Never more than 3 stats in a row.
<StatCard
  label="Pending Decisions"
  value={7}
  context="3 are P1"
  color="var(--p2)"
  trend="+2 from yesterday"
/>
```
Visual: Large mono number. Small label above. Tiny context below.
Color: The number color matches semantic meaning.

### Data Table
```
- Sticky header
- Row hover: bg-elevated
- Selected row: left border 3px colored + bg-overlay
- Priority column: colored dot, never just text
- Status column: pill badge, color-coded
- Time column: relative ("2h ago") not absolute
- Action column: icon buttons only, labels on hover
- Empty state: icon + message + primary action
- Loading state: skeleton rows (animated pulse)
```

### Decision Row (Core Component)
```
Each row in the inbox table must show at a glance:
├── Priority dot (P1=red, P2=amber, P3=blue) — leftmost
├── Source icon (Lark/Chatwoot/BeLive OS)
├── Agent badge (CEO/CFO/COO/CTO) with agent color
├── AI summary — one line, truncated
├── Sender name
├── Confidence bar (thin, colored)
├── Time ago
└── Status pill
```

### Drawer (Decision Detail)
```
Slides in from right. Never full-screen modal.
Width: 480px on desktop, full-width on mobile.
Contains:
├── Full message content
├── AI proposed reply (editable textarea)
├── AI reasoning (collapsible)
├── Confidence score + explanation
├── Past similar decisions (last 3)
└── Action buttons (Approve / Edit & Send / Reject)
```

### Priority Badge
```tsx
// Always use these exact styles
const priority = {
  P1: { bg: 'var(--p1-dim)', color: 'var(--p1)', label: 'P1' },
  P2: { bg: 'var(--p2-dim)', color: 'var(--p2)', label: 'P2' },
  P3: { bg: 'var(--p3-dim)', color: 'var(--p3)', label: 'P3' },
}
// Always show as pill. Never just text.
```

### Agent Badge
```tsx
const agents = {
  ceo: { color: '#9B6DFF', label: 'CEO' },
  cfo: { color: '#4BB8F2', label: 'CFO' },
  coo: { color: '#F2784B', label: 'COO' },
  cto: { color: '#4BF2A2', label: 'CTO' },
}
// Small pill with colored dot. Consistent everywhere.
```

### Live Indicator
```tsx
// Always show at top right — Nucleus is always on
<div className="flex items-center gap-1.5">
  <span className="w-1.5 h-1.5 rounded-full bg-[--success] animate-pulse" />
  <span className="font-mono text-[10px] text-[--text-muted] tracking-widest">
    LIVE
  </span>
</div>
```

### Empty State
```tsx
// Every empty table/list must have one
<EmptyState
  icon={<Inbox />}
  title="No pending decisions"
  message="The Twin has nothing waiting for your approval."
/>
// Never show a blank screen
```

---

## Animation — Motion with Purpose

### Install
```bash
npm install framer-motion
```

### The 5 Animations Nucleus Uses

#### 1. Page Entry — Staggered Reveal
```tsx
import { motion } from 'framer-motion'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
}

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } }
}

// Wrap list items with motion.div variants={item}
// Wrap container with motion.div variants={container}
```

#### 2. Drawer Slide-In
```tsx
<motion.div
  initial={{ x: '100%', opacity: 0 }}
  animate={{ x: 0, opacity: 1 }}
  exit={{ x: '100%', opacity: 0 }}
  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
>
  {/* Decision detail drawer */}
</motion.div>
```

#### 3. New Decision Arrives (Realtime)
```tsx
// When a new row appears via Supabase realtime
<motion.tr
  initial={{ opacity: 0, backgroundColor: '#F2784B20' }}
  animate={{ opacity: 1, backgroundColor: 'transparent' }}
  transition={{ duration: 1.5 }}
>
  {/* Row content */}
</motion.tr>
// The coral flash tells Lee: this just came in
```

#### 4. Number Counter (Stats)
```tsx
function useCountUp(target: number, duration = 1000) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let start = 0
    const step = target / (duration / 16)
    const timer = setInterval(() => {
      start += step
      if (start >= target) { setCount(target); clearInterval(timer) }
      else setCount(Math.floor(start))
    }, 16)
    return () => clearInterval(timer)
  }, [target])
  return count
}
// Numbers count up on page load. Feels alive.
```

#### 5. Approve Button — Confirmation Pulse
```tsx
<motion.button
  whileTap={{ scale: 0.96 }}
  whileHover={{ scale: 1.02 }}
  onClick={handleApprove}
>
  Approve
</motion.button>
// Subtle. Responsive. Satisfying.
```

### Animation Rules
- Duration: 150–400ms max. Never slow.
- Easing: spring for panels/drawers. ease-out for fades.
- Never animate layout shifts — use opacity + transform only
- Respect prefers-reduced-motion:
  ```tsx
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // Skip animations if true
  ```

---

## Real-Time UI Patterns

Nucleus is always live. The UI must feel alive.

### Supabase Realtime Integration
```tsx
'use client'
// When new decision arrives:
// 1. Flash the new row with coral background (fades out)
// 2. Increment the pending counter with animation
// 3. If P1 — show toast notification immediately

// Toast for P1:
import { toast } from 'sonner'
toast.error('P1 Alert — Needs you now', {
  description: summary,
  duration: 0, // stays until dismissed
  action: { label: 'View', onClick: () => openDecision(id) }
})
```

### Live Timestamps
```tsx
// Never show static timestamps
// Use relative time that updates
function TimeAgo({ date }: { date: string }) {
  const [label, setLabel] = useState(getRelativeTime(date))
  useEffect(() => {
    const interval = setInterval(() => setLabel(getRelativeTime(date)), 30000)
    return () => clearInterval(interval)
  }, [date])
  return <span>{label}</span>
}
```

### Connection Status
```tsx
// Always show if Nucleus lost connection to Supabase realtime
// Small banner at top: "Warning: Reconnecting..." in amber
// Disappears when reconnected
```

---

## The Morning Dashboard — Layout Spec

```
┌─────────────────────────────────────────────────────┐
│  BeLive Nucleus               ● LIVE    Lee Seng Hee │
├──────┬──────────────────────────────────────────────┤
│      │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│      │  │  2   │ │  7   │ │  14  │ │  3   │       │
│      │  │ P1s  │ │Pend. │ │Auto  │ │ Sent │       │
│      │  └──────┘ └──────┘ └──────┘ └──────┘       │
│      │                                              │
│      │  ── Needs You ──────────────────────────    │
│      │  [P1] Owner threatening exit — Mont Kiara   │
│      │  [P1] System down — BeLive OS Cluster C4    │
│      │                                              │
│      │  ── Pending Approval ───────────────────    │
│      │  7 decisions waiting · [View All →]         │
│      │                                              │
└──────┴──────────────────────────────────────────────┘
```

---

## Interaction Patterns

### Keyboard Shortcuts
```
[Cmd+K]  → Command palette (search decisions, jump to pages)
[A]      → Approve selected decision
[E]      → Edit & send selected decision
[R]      → Reject selected decision
[J/K]    → Navigate up/down in decision list
[Esc]    → Close drawer/modal
```
Show keyboard shortcut hints on hover over buttons.

### Optimistic UI
```tsx
// When Lee clicks Approve — update UI immediately
// Don't wait for API response
// Revert if API fails with error toast

async function handleApprove(id: string) {
  // 1. Optimistically update local state
  setDecisions(prev =>
    prev.map(d => d.id === id ? { ...d, status: 'approved' } : d)
  )
  // 2. Call API
  const { error } = await approveDecision(id)
  // 3. Revert if failed
  if (error) {
    setDecisions(prev =>
      prev.map(d => d.id === id ? { ...d, status: 'pending' } : d)
    )
    toast.error('Failed to approve. Try again.')
  }
}
```

### Editable AI Proposal
```tsx
// The AI proposal textarea should:
// - Show AI text pre-filled
// - Be editable inline (no separate edit mode)
// - Show character count
// - Auto-resize with content
// - Save draft to localStorage on every keystroke
// - Show "edited" indicator when changed from AI original
```

---

## Component Libraries to Use

### Primary Stack
```bash
npm install framer-motion           # animations — REQUIRED
npm install sonner                  # toast notifications
npm install @radix-ui/react-dialog  # accessible modals/drawers
npm install @radix-ui/react-tooltip # tooltips
npm install lucide-react            # icons
npm install date-fns                # date formatting
```

### For Charts (Autonomy Score page)
```bash
npm install recharts                # simple, composable
# Use: AreaChart for trends, RadialBarChart for scores
```

### Do NOT Add
```
- No MUI / Ant Design / Chakra — too opinionated, wrong aesthetic
- No Bootstrap — outdated
- No jQuery — obviously
- No heavy animation libraries (GSAP) — overkill for this
- Framer Motion is sufficient for everything Nucleus needs
```

---

## Page-by-Page UI Spec

### 1. Login Page
```
Centered. Dark background. BeLive Nucleus logo.
Simple email + password. No social login for now.
Tagline: "Your command center is live."
```

### 2. Overview (Morning Dashboard)
```
Top: greeting + date
Stats row: P1 count, Pending, Auto-handled, Sent today
Blockers: P1 items inline, click → opens drawer
Pending: count + "View All" link
Sources: Lark / Chatwoot / BeLive OS message counts
Agent status: 4 agents, last activity time
```

### 3. Inbox (Decision Feed)
```
Left panel (340px): filterable list of decisions
Right panel: decision detail drawer (inline, not overlay)
Filters: All / Pending / P1 / By Agent / By Source
Sort: newest first by default
Search: filter by sender name or content
```

### 4. Agent Pages (CEO / CFO / COO / CTO)
```
Each agent has its own page:
- Agent header with color identity
- Approval rate score (big number)
- Problem type breakdown
- Recent decisions for this agent
- Memory summary (what patterns it has learned)
- Skills installed (list with toggle)
```

### 5. Memory Page
```
Table: agent | problem_type | approval_rate | decisions | autonomous
Progress bars for each type
"Close to autonomy" highlighted section
```

---

## Mobile Considerations
Lee checks Nucleus on his phone.

```
- Sidebar collapses to bottom tab bar on mobile
- Drawer becomes full-screen sheet on mobile
- Stats row becomes 2x2 grid
- Table rows show only: priority + summary + time + status
- Tap row → full-screen detail
- Approve/Edit/Reject buttons always visible at bottom (sticky)
- Font sizes scale up slightly for finger targets
- Min tap target: 44x44px
```

---

## Performance Rules

```
- Server Components for all data fetching (no useEffect for data)
- Client Components only for: real-time, interactions, animations
- Images: next/image always
- Fonts: next/font/google (no layout shift)
- Icons: lucide-react (tree-shakeable, no bundle bloat)
- Never import entire libraries — named imports only
- Lazy load charts (they're heavy)
- Skeleton screens, not spinners
```

---

## Accessibility Minimum

```
- All interactive elements keyboard accessible
- Focus ring always visible (custom: 2px coral ring)
- Color never the only indicator — always + icon or text
- ARIA labels on icon-only buttons
- Screen reader text for status badges
- Contrast ratio minimum 4.5:1 for all text
```

---

## The Final Test
Before shipping any page, ask:

1. Can Lee understand what needs his attention in 3 seconds?
2. Can Lee take action in 2 clicks or less?
3. Does anything on screen not help Lee decide? Remove it.
4. Does it feel alive — real-time, responsive, live?
5. Would a war strategist feel in control looking at this?

If all 5 are yes — ship it.
