# BeLive Nucleus — Product Specification v2.0

**Product:** BeLive Nucleus — AI-Powered CEO Command Center
**Version:** 2.0 (Post Phase 1 Build)
**Date:** 7 April 2026
**Author:** Lee Seng Hee, Founder & Group CEO
**Status:** Live in Production

---

## 1. What Nucleus Solves

Lee Seng Hee manages 3,000 rooms across 55+ condominiums in 11 operational clusters spanning KL, Penang, and Johor Bahru. Every day, hundreds of messages, tickets, and operational signals arrive across Lark (internal team chat), Chatwoot (external comms), and BeLive OS (operational system).

Before Nucleus:
- Lee manually read every Lark group (11 clusters + function groups)
- No single view of what's broken, who owns it, or how long it's been waiting
- Decisions scattered across chat threads — no audit trail
- Morning briefings written manually or not at all
- No way to know if a cluster is healthy without asking someone

After Nucleus:
- Every message across all systems flows into one unified intelligence layer
- AI classifies every problem, proposes Lee's response in his voice
- Lee approves, edits, or rejects — one click, sent as him
- Every cluster's operational health visible in 3 seconds per card
- Briefings generated automatically, reviewed before sending
- Full audit trail of every decision, every message, every action

---

## 2. Who Uses Nucleus

**Primary user:** Lee Seng Hee (sole user in Phase 1)
- Desktop: War Room at belive-nucleus.vercel.app (full command center)
- Mobile: Field Command Terminal at /m (iPhone PWA, swipe-to-decide)

**Indirect beneficiaries:**
- Cluster teams receive Lee's decisions faster (via Lark as Lee's account)
- Operations leads (Fatihah, Adam, Fariha) get AI-generated briefings
- Staff get tagged directly in messages with @mentions

---

## 3. The Eight Modules

### Module 1 — Command Center (/command)

The war room. A compact table showing every active incident across all clusters.

What Lee sees:
- 11-column table: severity, cluster, unit, category, issue, owner, priority, status, created, updated
- 20 issue categories (air con, plumbing, electrical, move in/out, cleaning, safety, etc.)
- Clickable stat pills: New / Awaiting Lee / Acting / Resolved
- 6 sort modes: Newest, Severity, Longest, Updated, Cluster, Owner
- Search across all fields
- Table or grouped view toggle

What Lee does:
- Click any incident → full detail page with 60/40 split
- Left: conversation timeline with staff names resolved
- Right: AI summary, proposed action, confidence score
- [Approve & Send] — sends as Lee to Lark group in thread
- [Send Custom] — Lee writes own message, sent as Lee
- [Test] — sends to Testing Group only (safe for testing)
- Filters, sort, and scroll position persist through session

### Module 2 — Cluster Health Wall (/clusters)

A situation board. 11 cluster cards scrolling horizontally, 4 visible at once.

Two views:
- **Category View** (default): 4 sections per card (Maintenance, Cleaning, Move In, Turnaround) with top 3 issues each, age coloring, OVR badges, owner names
- **Command View**: AI-generated 2-3 sentence situation summary + top 3 blockers cross-category + count pills

Features:
- 11-dot navigation strip (colored by health status, click to scroll)
- Per-cluster scan button in card footer
- Brief sent / standup received status icons
- Side panel opens on [+N more] with full ticket list
- Scan All button triggers full scan + health computation + AI enrichment
- View toggle persists in session

### Module 3 — Briefings & Reports (/briefings)

The editorial desk. Every report Nucleus generates goes through Lee's review before sending.

Two tabs:
- **Schedule tab** (default): 11 report types in 4 categories (Daily, Cluster, Management, On-Demand). Each card shows schedule, last run, success rate, last 7 run dots. [Run Now], [Retry], [View History] actions. Cron run history drawer with full detail per run.
- **Reports tab**: Chronological feed of all generated reports. Filter by type, status, cluster. Batch select + send. Draft/Sent/Failed status pills.

Report types:
- Morning Intelligence Briefing (8:30am, system-wide)
- Pre-Standup Brief (8:00am, per cluster x11)
- Midday Pulse (12:30pm, per cluster)
- End of Day / OCC Review (6:30pm, per cluster)
- Compliance Alert (on trigger)
- Weekly Ops Review, Monthly Report, Owner Satisfaction (management)
- Cluster Snapshot, Incident Summary, Sales Snapshot (on-demand)

Report detail page:
- Full content with inline editor (textarea)
- Reset to AI original
- Send destinations with checkboxes (resolved names, type badges)
- Generation log: data sources, AI reasoning, processing time, tokens
- Smart Send button showing destination names
- [Test] button sends to Testing Group only

Auto-send system:
- Confidence tracking per report type (consecutive approvals)
- Auto-send eligible after 10 consecutive approvals
- Lee can force-enable or disable anytime
- Auto-sent reports marked with lightning badge

### Module 4 — Monitored Groups (/groups)

Configuration page for which Lark groups Nucleus monitors.

What Lee configures:
- Add/edit/pause groups
- Set group type (cluster, ai_report, function, sales)
- Set cluster assignment (C1-C11)
- Set context description for AI classification
- Toggle scanning on/off

### Module 5 — Watchdog (/watchdog)

Activity log showing everything Nucleus does.

7 event types: MESSAGE_RECEIVED, AI_CLASSIFIED, INCIDENT_CREATED, LEE_ACTION, SYSTEM_SENT, SCHEDULED_JOB, ERROR

Features:
- Filter by event type and cluster
- Expandable detail per event
- Staff names resolved (never raw IDs)
- Error count badge on sidebar
- Today's stats summary

### Module 6 — Mobile PWA (/m)

Field Command Terminal for iPhone. Not a shrunken desktop — a different instrument.

4 tabs:
- **Urgent**: P1 cards with Act Now buttons, stat summary (P1/Queue/Resolved)
- **Queue**: Swipe-to-approve card flow (swipe right = approve, left = skip), AI proposal, confidence bar, edit sheet, confirm sheet, progress bar
- **Clusters**: 11 colored dots, cluster cards with 4 metrics, tap → bottom sheet detail
- **Reports**: Draft reports with Read/Send/Discard, Send All Drafts, full report reader sheet

PWA features:
- Add to Home Screen (standalone, no browser chrome)
- Auto-redirect mobile users to /m
- Push notifications: P1 alerts, new reports, queue updates
- Bottom nav with live badge counts
- All touch targets 44x44pt minimum, thumb zone respected

### Module 7 — Settings (/settings)

Staff directory with 34+ synced staff members. Lark contact API sync. Manual refresh.

### Module 8 — Authentication

Lark SSO (OAuth OIDC). Auto-detect Lark Web App. 3 allowed open_ids for Lee. JWT sessions with HttpOnly cookies. Middleware protection on all routes.

---

## 4. Business Rules

### Incident Lifecycle
new → analysed → awaiting_lee → acting → resolved → archived

### Priority Classification
- P1: Emergency, safety, owner exit threat — 2 hour response, Lee DM alert
- P2: Unresolved >24h, revenue impact — same day
- P3: Routine — within 48 hours

### AI Classification
- Claude claude-sonnet-4-6 classifies every message
- 20 issue categories
- Confidence score 0-100
- Auto-execute if confidence >= 95 (Phase 3)

### Message Sending
- ALL messages sent as Lee's personal Lark account (user token, never bot)
- @mention detection: staff names auto-tagged with Lark `<at>` tags
- Thread replies: messages sent in reply thread when source_lark_message_id exists
- Safety gate: TEST_MODE redirects all sends to Testing Group

### Noise Filtering
- Messages < 15 characters filtered
- Common phrases filtered: "ok", "noted", "thanks", "roger", "done", etc.
- Bot self-messages filtered by LARK_BOT_OPEN_ID

### Deduplication
- Incidents deduplicated by source_message_id (unique constraint)
- Scan dedup: messages already in lark_group_messages skipped
- Report dedup: only one report per scheduled_for + report_type

---

## 5. Success Metrics

### Operational Efficiency
- **Response time**: Average time from incident creation to Lee's decision
- **Queue clearance**: % of awaiting_lee incidents decided within 4 hours
- **Zero missed P1s**: Every P1 reaches Lee within 2 minutes (push + DM)

### AI Quality
- **Classification accuracy**: % of incidents Lee doesn't reclassify
- **Proposal acceptance**: % approved without editing
- **Confidence calibration**: Are high-confidence proposals actually approved?

### Briefing Quality
- **Approval rate per report type**: Track toward auto-send eligibility
- **Consecutive approvals**: How close each type is to auto-send threshold
- **Edit rate**: How often Lee modifies before sending

### Cluster Visibility
- **Scan freshness**: Time since last scan per cluster (< 1 hour target)
- **SLA breach count**: Decreasing trend = system is working
- **Silent hours**: No cluster should be silent > 12 hours

### System Health
- **Cron success rate**: > 95% across all scheduled jobs
- **Error rate**: < 5 errors per day (watchdog)
- **Uptime**: Vercel deployment availability

---

## 6. What's Not Built Yet

- CEO/CFO/CTO agent pages (/ceo, /cfo, /cto) — placeholder routes exist
- Chatwoot full integration (webhook listener exists, not actively used)
- BeLive OS webhook integration
- Multi-user access (Eason, Keith, CJ)
- Autonomy / auto-execute gate (95% threshold)
- Skills marketplace
- Analytics dashboard
- Lark Base connector (spec written, not built)
- Owner satisfaction tracking
- Sales pipeline integration

---

## 7. Open Questions

| Question | Status |
|----------|--------|
| When to disable TEST_MODE for real cluster sends? | Lee decides — currently ON |
| Should briefings send as Lark interactive cards or plain text? | Cards for pre-standup/OCC, text for others |
| When to add Eason/Keith as users? | After Phase 1 stabilizes |
| Should auto-send require Lee's explicit toggle per type? | Yes — confirmed in spec |
| Push notification frequency cap? | Queue updates max 1 per 30 min |

---

## Document Control

| Field | Value |
|-------|-------|
| Document | BeLive Nucleus Product Specification |
| Version | 2.0 |
| Created | 7 April 2026 |
| Author | Lee Seng Hee |
| Supersedes | NUCLEUS-PRD-v1.md |
| Next review | After Phase 2 planning |

---

*Confidential — BeLive Property Hub / Spacify Technologies*
