# Skill: War Room UI/UX Design System

## Design Philosophy
BeLive Nucleus is a CEO war room — not a consumer app.
Dark, focused, data-dense. Every pixel serves a decision.

## Color Palette
```
--primary: #F2784B        /* coral — CTAs, active states */
--primary-hover: #E0673D  /* darker coral for hover */
--navy: #1B2537           /* headers, cards */
--background: #080E1C     /* page background */
--surface: #0D1525        /* card/panel background */
--border: #1A2035         /* subtle borders */
--success: #4BF2A2        /* approved, positive */
--warning: #E8A838        /* needs attention */
--error: #E05252          /* rejected, critical */
--text-primary: #FFFFFF   /* main text */
--text-secondary: #8892A5 /* muted text, labels */
--text-tertiary: #4A5568  /* disabled, placeholder */
```

## Typography
- Body: DM Sans (import from Google Fonts)
- Code/Data: JetBrains Mono
- Sizes: Use Tailwind classes only (text-xs, text-sm, text-base, text-lg, text-xl)
- Never use px for font sizes

## Tailwind Usage
```typescript
// Card
className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4"

// Primary button
className="bg-[#F2784B] hover:bg-[#E0673D] text-white rounded-lg px-4 py-2 font-medium transition-colors"

// Ghost button
className="text-[#8892A5] hover:text-white hover:bg-[#1A2035] rounded-lg px-3 py-1.5 transition-colors"

// Badge — Priority
// P1
className="bg-[#E05252]/10 text-[#E05252] text-xs font-medium px-2 py-0.5 rounded-full"
// P2
className="bg-[#E8A838]/10 text-[#E8A838] text-xs font-medium px-2 py-0.5 rounded-full"
// P3
className="bg-[#8892A5]/10 text-[#8892A5] text-xs font-medium px-2 py-0.5 rounded-full"

// Badge — Status
// pending
className="bg-[#E8A838]/10 text-[#E8A838] text-xs font-medium px-2 py-0.5 rounded-full"
// approved
className="bg-[#4BF2A2]/10 text-[#4BF2A2] text-xs font-medium px-2 py-0.5 rounded-full"
// rejected
className="bg-[#E05252]/10 text-[#E05252] text-xs font-medium px-2 py-0.5 rounded-full"
```

## Layout Patterns
```typescript
// Page layout — full height, sidebar + main
className="flex h-screen bg-[#080E1C]"

// Sidebar
className="w-64 bg-[#0D1525] border-r border-[#1A2035] flex flex-col"

// Main content area
className="flex-1 overflow-y-auto p-6"

// Dashboard grid
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
```

## Component Patterns

### Decision Card
```typescript
<div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4 hover:border-[#F2784B]/30 transition-colors">
  <div className="flex items-center justify-between mb-2">
    <span className="text-xs text-[#8892A5]">COO Agent</span>
    <PriorityBadge priority="P1" />
  </div>
  <p className="text-white text-sm mb-3">{ai_summary}</p>
  <div className="flex gap-2">
    <button className="bg-[#4BF2A2]/10 text-[#4BF2A2] ...">Approve</button>
    <button className="bg-[#E05252]/10 text-[#E05252] ...">Reject</button>
  </div>
</div>
```

### Stat Card
```typescript
<div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4">
  <p className="text-xs text-[#8892A5] mb-1">Pending Decisions</p>
  <p className="text-2xl font-bold text-white font-mono">12</p>
</div>
```

## Animation (Framer Motion)
```typescript
// Card entrance
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2 }}
>

// List stagger
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ delay: index * 0.05 }}
>
```

## Toast Notifications (Sonner)
```typescript
import { toast } from 'sonner'

toast.success('Decision approved')
toast.error('Failed to send reply')
toast.info('New event from Lark')
```

## Icons (Lucide React)
```typescript
import { Inbox, CheckCircle, XCircle, AlertTriangle, Clock, Send } from 'lucide-react'
// Size: 16px for inline, 20px for buttons, 24px for headers
```

## Responsive
- Desktop-first, but must work on mobile (Lee checks on phone)
- Sidebar collapses on mobile
- Cards stack vertically on small screens
- Minimum touch target: 44px

## Rules
- Never use white backgrounds — always dark
- Never use borders heavier than 1px
- Always use transition-colors on interactive elements
- Always use rounded-lg or rounded-xl — never sharp corners
- Data numbers always in JetBrains Mono (font-mono)
- Keep information density high — Lee wants to see everything at a glance
