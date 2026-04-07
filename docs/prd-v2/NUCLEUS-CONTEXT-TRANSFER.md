# BeLive Nucleus — Complete Context Transfer Document

**Purpose:** This is the single document to onboard any new developer, AI agent, or team member onto the BeLive Nucleus project. Read this first. Everything you need to know is here.

**Last updated:** 7 April 2026
**Repository:** github.com/senghee27/belive-nucleus
**Live:** belive-nucleus.vercel.app
**Owner:** Lee Seng Hee (Group CEO, BeLive Property Hub)

---

## PART 1 — THE COMPANY

### What BeLive Is

BeLive Property Hub is a co-living property management company in Malaysia. Not a traditional property manager — an ROI execution platform for residential property investors. BeLive converts ordinary condo units into higher-yield co-living rooms, manages tenanting, operations, maintenance, and service.

**Scale:** 3,000+ rooms, 55+ condominiums, 3 cities (KL, Penang, JB), 11 operational clusters (C1–C11).

**Revenue model:** Dual monetization — earns from both property owners (cleaning fee, system fee, marketing fee, maintenance) and tenants (non-deposit fee, AC fee, water, electricity, move-in fee, renewal fee). Monthly gross revenue potential: ~RM2.1M.

**Why this matters for Nucleus:** Every hour of delay in resolving a maintenance issue, turning around a vacant room, or responding to an owner = direct revenue impact. 1% OR improvement = RM21,000/month. Nucleus exists to compress Lee's decision time from hours to minutes.

### Leadership

| Name | Title | Owns |
|------|-------|------|
| Lee Seng Hee | Group CEO + Head of Experience | Vision, strategy, owner relationships, ALL cluster oversight |
| Keith Kuang | Executive Director + Head of Revenue | Sales, Branding & Marketing |
| Eason Tee | Executive Director + Head of Fulfilment | Renovation, Fulfilment, Cleaning |
| CJ Teoh | Chief Business Officer | AI & Technology |

### The 11 Clusters (April 2026)

| Cluster | Location | Units | IOE | Key Staff |
|---------|----------|-------|-----|-----------|
| C1 | Johor Bahru | 403 | Nureen | Kit (ITS), Aqila (OOS), Ali (Tech) |
| C2 | Batu Kawan, Penang | 239 | Intan | Wawa (ITS), Asyraf (OOS), Faiq (Tech) |
| C3 | Nilai, Sepang | 184 | Aireen | Alan (ITS), Amin (OOS), Ayad (Tech) |
| C4 | Ampang, Setapak | 287 | Aliya | Danial (Tech) |
| C5 | Ara Damansara | 195 | Aliya | Asyraaf (ITS), Johan (OOE), Airul (Tech) |
| C6 | PJ, Subang | 292 | Intan | Johan (OOE), Hariz (Tech) |
| C7 | Seri Kembangan | 296 | Mardhiah | A'syraf (OOE), Ayad (Tech) |
| C8 | Sentul, Jln Ipoh | 274 | Mardhiah | Ummi (ITS), Zowie (OOE), Airul/Danial (Tech) |
| C9 | Sg Besi, Cheras | 170 | Intan | Danish (ITS), Safie (OOE), Faris (Tech) |
| C10 | Mont Kiara, Bukit Jalil | 159 | Nureen | Cantika/Alan/Ummi (ITS), Zowie (OOE) |
| C11 | M Vertica, Cheras | 385 | Airen | Wawa (ITS), Safie (OOE), Faris (Tech) |

**Cross-cluster leaders (same person across ALL 11):**
- Operation Manager: Fatihah
- OOE Leader: Adam
- Maintenance Manager: Fariha
- Owner Relations Lead: Linda (Rafflinda)
- Housekeeping Manager: David
- Indoor Sales Leads: Norisz & Nadia
- Outdoor Sales Lead: Rezza

### The Cell Operating Model

Each cluster runs as a 3-role cell:
- **IOE (Brain)** — Case owner, tenant comms, priority setter, cell coordinator
- **OOE (Body)** — Physical execution, inspection, turnaround, room readiness
- **Technician (Hands)** — Repair execution, fix quality, SLA compliance

IOE owns every case until the tenant confirms closure. Single accountable owner for every issue.

### Lee's Decision Principles

1. Ops stability before revenue
2. Protect owner relationships first — always
3. P1 = respond within 2 hours, no exceptions
4. Issue is only resolved when tenant confirms — not when tech says "done"
5. Single accountable owner for every case — no bouncing
6. Escalate visibility by tagging in group, not private DM

### Lee's Communication Style (Manglish)

- Tag names directly with @mentions — no "Hi team" opener
- Firm but caring coaching tone
- "Can help follow up?", "What's the blocker?", "Tenant been waiting quite long already"
- End with offer of help + "Thanks 🙏"
- Direct, decisive, names people, gives deadlines

---

## PART 2 — WHAT NUCLEUS IS

### The One-Line Summary

Nucleus is an AI-powered command center that reads every Lark message across all 11 clusters, classifies problems, proposes Lee's response in his voice, and sends it as his personal account after his approval.

### Philosophy

```
Desktop = War Room (dense information, full control, keyboard)
Mobile  = Field Command Terminal (one thumb, one decision, done)

The system is NOT a chatbot, NOT a dashboard.
It is an invisible Chief of Staff that surfaces only what needs Lee.

Nothing goes out blind.
Nothing happens in a black box.
Every report has a visible generation log.
Lee reviews every report.
Lee approves, edits, or discards.
Over time, Lee builds confidence → flips the auto-send toggle.
```

### The Decision Loop

```
1. LISTEN  — Lark webhook captures every group message in real-time
2. CLASSIFY — Claude AI determines: which agent, what category, what priority
3. PROPOSE  — AI drafts Lee's response in Manglish, Lee's voice
4. DECIDE   — Lee approves, edits, or rejects (one click)
5. SEND     — Sent from Lee's personal Lark account (never bot)
6. LEARN    — Approval rate tracked per problem type → eventual autonomy
```

---

## PART 3 — THE TECH STACK

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 15, App Router, TypeScript | Server Components default, Client when needed |
| Database | Supabase (Postgres) | Realtime subscriptions, RLS, 19 migrations, 18 tables |
| AI | Anthropic Claude (claude-sonnet-4-6) | Classification, proposals, briefings, cluster summaries |
| Styling | Tailwind CSS v4 | Dark war room aesthetic |
| Animation | framer-motion + @react-spring/web | View transitions, swipe gestures |
| Auth | Lark OAuth OIDC + jose JWT (HS256) | HttpOnly cookies, middleware protection |
| Messaging | Lark API (user token) | Send as Lee, @mentions, thread replies, interactive cards |
| Push | web-push (VAPID) | P1 alerts, new reports, queue updates |
| Deployment | Vercel (Hobby plan) | Auto-deploy on push, daily cron only |

### Design System

```
Background:  #080E1C (deepest)
Surface:     #0D1525 (cards, panels)
Border:      #1A2035
Primary:     #F2784B (coral — BeLive brand)
Success:     #4BF2A2
Warning:     #E8A838
Error:       #E05252
Agent CEO:   #9B6DFF (purple)
Agent CFO:   #4BB8F2 (blue)
Agent COO:   #F2784B (coral)
Agent CTO:   #4BF2A2 (green)
Font Body:   DM Sans
Font Data:   JetBrains Mono
```

---

## PART 4 — THE 8 MODULES (WHAT'S BUILT)

### 1. Command Center (/command)
War room table with 57+ incidents. 6 sort modes, 20 categories, clickable stat pills. 60/40 detail page with conversation timeline + AI proposal. Approve & Send / Send Custom / Test buttons. Session state persistence.

### 2. Cluster Health Wall (/clusters)
11 cluster cards, 4 visible at once, horizontal scroll. Two views: Category (4 sections x 176px with top issues) and Command (AI summary + top 3 blockers). Dot navigation, per-cluster scan, IntersectionObserver tracking.

### 3. Briefings & Reports (/briefings)
Schedule tab (11 report types, 4 categories, run history drawer) + Reports tab (feed with filters, batch send). Detail page with editor, destinations, generation log. Auto-send confidence tracking. 11 report types from Morning Brief to Sales Snapshot.

### 4. Groups (/groups)
Configure which Lark groups are monitored. Set cluster, type, context, scanning toggle.

### 5. Watchdog (/watchdog)
Activity log with 7 event types. Filter by type/cluster. Staff name resolution. Error badge.

### 6. Mobile PWA (/m)
iPhone Field Command Terminal. 4 tabs: Urgent (P1 cards), Queue (swipe-to-approve), Clusters (dots + cards + sheets), Reports (send/read). Push notifications. Auto-redirect.

### 7. Settings (/settings)
Staff directory (34+ members). Lark contact API sync.

### 8. Auth
Lark SSO. 3 allowed open_ids. JWT sessions. Middleware protection.

---

## PART 5 — DATABASE (18 TABLES)

| Table | What It Stores |
|-------|---------------|
| incidents | Every classified issue (title, category, severity, priority, status, cluster, ai_proposal, ai_confidence) |
| incident_timeline | Conversation thread per incident |
| monitored_groups | Which Lark groups to scan (chat_id, cluster, type, context, scanning_enabled) |
| lark_group_messages | All captured messages (message_id, cluster, content, sender_name) |
| cluster_health_cache | Pre-computed health per cluster (score, status, ai_summary, top_blockers, top items) |
| briefing_reports | Every generated report (type, content, content_original, status, destinations, generation_log) |
| briefing_autosend_config | Confidence tracking per report type (consecutive_approvals, auto_send_enabled) |
| briefing_cron_runs | Every cron execution (status, duration, sources, tokens_used) |
| briefing_schedule_config | Schedule per report type (cron_expression, enabled, success_rate) |
| staff_directory | Staff name resolution (open_id, name, role, cluster, avatar) |
| nucleus_activity_log | Watchdog events (event_type, summary, detail) |
| ai_report_tickets | Parsed BLV-RQ tickets from AI Report group |
| scan_logs | Scan execution history |
| scan_schedules | Configurable scan jobs |
| standup_sessions | Daily standup tracking per cluster |
| daily_messages | Outbound messages log |
| lark_tokens | OAuth token storage (tenant + user + refresh) |
| push_subscriptions | Web push endpoints (VAPID) |

---

## PART 6 — KEY API ROUTES (50+)

**Webhook:** POST /api/events/lark (real-time Lark messages)
**Incidents:** GET/POST /api/incidents, /[id]/decide, /[id]/reply, /[id]/test-send
**Clusters:** GET /api/clusters, POST /api/clusters/scan, /[id]/refresh-summary
**Briefings:** GET/POST /api/briefings, /[id]/send, /[id]/reset, /send-batch, /schedule/[type]/run
**Mobile:** GET /api/m/summary, /api/m/queue, POST /api/m/incidents/[id]/decide
**Push:** POST /api/push/subscribe, /api/push/send
**Cron:** GET /api/cron (Vercel daily cron — runs all scheduled jobs)

---

## PART 7 — CRITICAL PATTERNS & GOTCHAS

### Things that broke before (and how they were fixed)

1. **AI returns JSON wrapped in markdown backticks** — `parseAIJson()` in incidents.ts strips ````json` wrappers. Without this, ALL classifications fail silently.

2. **Supabase admin leaks to client** — `supabase-admin.ts` uses a lazy proxy pattern. Never import it in client components.

3. **Lark interactive cards fail with "unknown property"** — Use v1 card format (no `schema` field). Elements at root level.

4. **Bot sends instead of Lee** — All send functions use Lee's user token only. NO bot fallback. Token expires every 2h — Lee must re-login at /auth/login.

5. **@_user_N placeholders** — Lark webhook includes mentions array with key/name mappings. Must parse and replace before saving content.

6. **Sender names show as ou_xxx** — Webhook handler resolves open_ids via staff_directory. API also resolves when returning incidents.

7. **Trailing slashes in middleware** — SECRET_ROUTES paths must NOT have trailing slashes (startsWith matching).

8. **Vercel Hobby cron limits** — Only daily crons allowed. All schedules consolidated into single /api/cron handler that runs time-based logic.

### Safety Gate

```typescript
// lib/lark.ts
const TEST_MODE = true  // ← CURRENTLY ON
// When true, ALL outbound messages redirect to test group
// Lee's DMs always allowed regardless of TEST_MODE
```

To go live: set `TEST_MODE = false` in lib/lark.ts. This is the ONLY switch.

### Auth Flow

```
iPhone opens belive-nucleus.vercel.app
→ Middleware checks JWT cookie
→ No cookie → redirect to /auth/login
→ Login page shows "Login with Lark" button
→ Lark OAuth → /api/auth/lark/callback
→ Verifies open_id is in ALLOWED_USERS list (3 IDs for Lee)
→ Creates JWT cookie → redirect to /overview
→ Mobile auto-redirect: /overview → /m (if iPhone user-agent)
```

### Incident Lifecycle

```
new → analysed → awaiting_lee → acting → resolved → archived
         ↓              ↓
    AI proposal    Lee approves/edits/rejects
    generated      → message sent as Lee
```

### Message Flow (Lark webhook → incident)

```
1. Lark sends webhook to /api/events/lark
2. Return 200 immediately, process via after()
3. Parse content, resolve @mentions, resolve sender name
4. Filter: bot messages, noise (<15 chars, "ok", "noted")
5. Check if monitored group → route by group_type
6. Try to match to existing incident (keywords, ticket_id, unit)
7. If no match → AI classify → create incident if is_incident
8. If P1 → DM Lee immediately
9. Log to watchdog
```

---

## PART 8 — ENVIRONMENT VARIABLES

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Lark
LARK_APP_ID=cli_xxx
LARK_APP_SECRET=xxx
LARK_BOT_OPEN_ID=ou_656cbe961cf2dd432df47bd6636406dd
LEE_LARK_CHAT_ID=ou_af2a40628719440234aa29656d06d322

# AI
ANTHROPIC_API_KEY=sk-ant-xxx

# Auth
JWT_SECRET=xxx
NUCLEUS_SECRET=belive_nucleus_2026
CRON_SECRET=xxx

# Push
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BGjw...
VAPID_PRIVATE_KEY=nRH1...
VAPID_EMAIL=mailto:lee@belive.com.my
```

---

## PART 9 — WHAT'S NOT BUILT YET

- CEO/CFO/CTO agent pages (placeholders exist)
- Chatwoot active integration
- BeLive OS webhook
- Multi-user access (Eason, Keith, CJ)
- Autonomy / auto-execute (95% gate)
- Skills marketplace
- Analytics dashboard
- Lark Base connector (spec written: LARK-BASE-CONNECTOR-SPEC.md)
- Real PWA icons (currently 1x1 pixel placeholders)

---

## PART 10 — HOW TO WORK ON THIS PROJECT

### Setup
```bash
git clone github.com/senghee27/belive-nucleus
cd belive-nucleus
npm install
cp .env.example .env.local  # fill in keys
npm run dev
```

### Branch strategy
- `main` → production (auto-deploys)
- `dev` → daily development (auto-deploys preview)
- `feature/*` → individual features, branch from dev

### Database rules
- NEVER edit existing migration files
- New changes = new migration file: `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
- Push: `npx supabase db push`
- Always add RLS, updated_at trigger, indexes

### Code rules
- App Router only, no Pages Router
- Server Components default, Client only when needed
- Named exports for components
- No `any` types — always type properly
- Error handling on every async function
- Never import supabase-admin in client components

### Lee's preferences (from working with him)
- He directs, AI agents build
- He wants visibility before automation, trust before autonomy
- He prefers one bundled PR over many small ones for refactors
- He doesn't want trailing summaries — he reads the diff
- He wants everything deployed to both dev AND main
- Run migrations for him — don't tell him to do it

---

*This document is the single source of truth for onboarding onto BeLive Nucleus. If it contradicts any other document, this one is correct.*

*Confidential — BeLive Property Hub / Spacify Technologies*
