# BeLive Nucleus — Product Requirements Document

**Version:** v1.0
**Date:** April 2026
**Author:** Lee Seng Hee, Founder & Group CEO
**Status:** Draft

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Company Context](#2-company-context)
3. [The Four Agents](#3-the-four-agents)
4. [How It Works — The Decision Loop](#4-how-it-works--the-decision-loop)
5. [Phase 1 — What We Are Building Now](#5-phase-1--what-we-are-building-now)
6. [Full Roadmap](#6-full-roadmap)
7. [Technical Architecture](#7-technical-architecture)
8. [Design Principles](#8-design-principles)
9. [Agent Development Setup](#9-agent-development-setup)
10. [Success Metrics](#10-success-metrics)
11. [Risks and Constraints](#11-risks-and-constraints)
12. [Key Decisions Made](#12-key-decisions-made)

---

## 1. Executive Summary

### The Problem

Lee Seng Hee manages 3,000 rooms across 55+ condominiums in KL, Penang, and Johor Bahru. Every day, problems arrive across three separate systems:

- **Lark** — internal team communication
- **Chatwoot** — tenant, owner, and prospect conversations
- **BeLive OS** — operational alerts and tickets

Lee is the only bridge between all three. This is not scalable.

### The Solution

BeLive Nucleus is a standalone AI-powered command center that:

- Listens to all three systems simultaneously
- Classifies every problem automatically
- Proposes a decision the way Lee would
- Waits for his approval

Over time, as Lee approves decisions, the system learns his logic and begins handling problems autonomously — freeing Lee to focus only on what genuinely requires the Group CEO.

### What Nucleus Is Not

Nucleus is not a chatbot. It is not a dashboard you log into to read data. It is an invisible Chief of Staff that lives inside Lee's daily workflow — surfacing only what needs him, handling the rest silently.

---

## 2. Company Context

### BeLive Property Hub

| Detail | Info |
|--------|------|
| Business | Co-living property management, Malaysia |
| Rooms | 3,000 under management |
| Properties | 55+ condominiums |
| Cities | Kuala Lumpur, Penang, Johor Bahru |
| Clusters | 11 operational clusters (C1–C11) |

### Leadership Team

| Name | Role | Responsibility |
|------|------|----------------|
| Lee Seng Hee | Founder & Group CEO | Vision, strategy, owner relationships, final decisions |
| Eason | Executive Director, Operations | Operations across all clusters |
| Keith | Executive Director, Revenue | Revenue strategy and growth |
| CJ | Chief Business Officer | Business development and partnerships |
| Brittany | Revenue & Sales Manager | Sales pipeline and tenant acquisition |
| Yee Bin | Finance Executive | Financial operations and reporting |

### The 11 Clusters

| Cluster | Coverage |
|---------|----------|
| C1 | Johor Bahru |
| C2 | Penang / Batu Kawan |
| C3 | Nilai / Sepang |
| C4 | Ampang / Setapak |
| C5 | Ara Damansara |
| C6 | PJ / Subang |
| C7 | Seri Kembangan |
| C8 | Sentul / Jln Ipoh |
| C9 | Sg Besi / Cheras |
| C10 | Mont Kiara / Bukit Jalil |
| C11 | Cheras (M Vertica, OM = Fatihah) |

### Existing Systems

| System | Purpose | Type |
|--------|---------|------|
| Lark | Internal team communication | All staff use this |
| Chatwoot | External: tenants, owners, prospects | Self-hosted |
| BeLive OS | Property management platform | Built on Next.js + Supabase |

> All three are currently siloed. Lee manually bridges them. Nucleus fixes this.

---

## 3. The Four Agents

Each agent mirrors a C-suite executive role. Each has its own decision scope, memory, and autonomy track.

| Agent | Listens To / Owns | Proposes |
|-------|------------------|---------|
| 👤 **CEO Twin** | Owner relationships, staff escalations, strategic issues | Final calls, relationship responses, org decisions |
| 💰 **CFO Twin** | Payout delays, billing disputes, cash flow alerts | Payment instructions, financial timelines, dispute responses |
| 🔧 **COO Twin** | Ops tickets, maintenance, tenant complaints, emergencies | Dispatch instructions, SLA decisions, operational responses |
| 💻 **CTO Twin** | Tech bugs, BeLive OS issues, development progress | Prioritization, unblocking decisions, tech responses |

### Agent Colors (UI Identity)

```
CEO → #9B6DFF  (purple  — strategic)
CFO → #4BB8F2  (blue    — financial)
COO → #F2784B  (coral   — operational)
CTO → #4BF2A2  (green   — technical)
```

### The Autonomy Gate

Each agent tracks its approval rate per problem type.

When Lee approves **95% of suggestions** for a specific problem type (minimum 10 decisions), that problem type becomes **autonomous** — the agent handles it without asking Lee. Lee receives a FYI notification only.

Autonomy is unlocked per problem type, not per agent. The system gets smarter one problem type at a time.

---

## 4. How It Works — The Decision Loop

Every message or alert flows through the same 6-step pipeline regardless of source.

### Step 1 — Listen

Nucleus monitors all three systems simultaneously via webhooks. Every incoming message, alert, or ticket is captured and logged to the `events` table in Supabase.

### Step 2 — Classify

The AI reads the message and determines:
- Which agent owns this?
- What type of problem is it?
- What priority?

**Priority definitions:**

| Priority | Meaning | Examples |
|----------|---------|---------|
| P1 | Emergency — act now | Safety issue, owner threatening exit, system down |
| P2 | Needs attention | Unresolved >24hrs, revenue impact, staff conflict |
| P3 | Routine | Informational, low urgency, standard requests |

> P1 always alerts Lee immediately. No suggestion. No waiting.

### Step 3 — Propose

The assigned agent:
1. Reads past similar decisions from memory
2. Applies Lee's learned logic
3. Drafts a reply the way Lee would write it

The reply sounds like a decisive CEO — not a bot.

### Step 4 — Lee Decides

Lee sees the proposal in the Nucleus dashboard. Three options:

| Action | What Happens |
|--------|-------------|
| **Approve** | Sends exactly as proposed |
| **Edit** | Lee modifies inline, sends edited version |
| **Reject** | Marked rejected, no message sent, override logged for learning |

### Step 5 — Send

The approved reply is sent from the correct channel:

- **Lark message** → sent from Lee's personal Lark account
- **Chatwoot conversation** → sent via Chatwoot support channel
- **BeLive OS ticket** → ticket updated directly

The team sees it coming from the right person. Not a bot.

### Step 6 — Learn

Every decision is logged. Approval rate per problem type is recalculated. When a type hits 95% — autonomous mode unlocks permanently for that problem type.

---

## 5. Phase 1 — What We Are Building Now

> Phase 1 is the minimum viable loop. One complete working cycle from message received to reply sent. Everything else comes later.

### In Scope

- Lark webhook listener — captures all incoming Lark messages
- Chatwoot webhook listener — captures all incoming Chatwoot conversations
- `events` table — logs every message with source, sender, content, timestamp
- COO Agent — classifies ops/maintenance/tenant messages, proposes replies
- `decisions` table — stores every proposal with confidence, reasoning, status
- Inbox UI — Lee sees all pending decisions in one table
- Decision drawer — click any row, see full detail, AI proposal, reasoning
- Approve flow — one click, sends reply via Lark as Lee or via Chatwoot
- Edit flow — Lee edits proposal inline, sends edited version
- Reject flow — marks rejected, no message sent, logs override for learning
- Memory update — approval rate recalculates after every decision
- Morning overview page — summary of overnight activity

### Explicitly Out of Scope — Phase 1

- CEO, CFO, CTO agents → Phase 2
- BeLive OS webhook integration → Phase 2
- Multi-user access for Eason, Keith, CJ → Phase 2
- Autonomy / auto-execute → Phase 3
- Skills marketplace → Phase 4
- Analytics and reporting module → Phase 3
- Mobile native app (UI is mobile-responsive, not a native app)

### Acceptance Criteria

Phase 1 is complete when all of the following are true:

- [ ] A Lark message appears in the Nucleus inbox within 10 seconds
- [ ] A Chatwoot incoming message appears in the Nucleus inbox within 10 seconds
- [ ] Each decision shows: sender, summary, agent, confidence, proposed reply, reasoning
- [ ] Lee approves a decision and the reply arrives in Lark from Lee's account
- [ ] Lee edits a decision and the edited reply is sent
- [ ] Lee rejects a decision and it is marked rejected with no message sent
- [ ] After 5 approvals for a problem type, the approval rate calculates correctly
- [ ] Morning overview page shows correct counts for pending, auto-handled, sent
- [ ] The entire UI renders correctly on iPhone screen size

---

## 6. Full Roadmap

| Phase | Name | What Gets Built | Status |
|-------|------|----------------|--------|
| **P1** | Core Loop | Lark + Chatwoot listeners, COO Agent, Inbox UI, Approve/Edit/Reject, Memory | 🔨 Building |
| **P2** | Full Agents | CEO, CFO, CTO agents, BeLive OS webhook, Multi-user access, Agent pages | 📋 Planned |
| **P3** | Autonomy | 95% gate unlocking, auto-execute, FYI notifications, Analytics dashboard | 📋 Planned |
| **P4** | Skills | Skills marketplace, install/remove per agent, custom skill builder | 📋 Planned |
| **P5** | Scale | Eason/Keith/CJ access, role-based views, Lark MCP real-time integration | 🔮 Future |

---

## 7. Technical Architecture

### Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 15, App Router, TypeScript | Same stack as BeLive OS — consistency |
| Styling | Tailwind CSS v4 | Utility-first, fast iteration |
| Database | Supabase (Postgres) | Realtime subscriptions, Row Level Security |
| AI Layer | Anthropic Claude API | `claude-sonnet-4-6` for all agents |
| Animations | Framer Motion | War room micro-interactions |
| Deployment | Vercel | Preview deploys per branch, instant CI/CD |
| Version Control | GitHub | Feature branches, PR reviews |
| Lark Integration | Lark OAuth + Webhook | Sends as Lee's personal account |
| Chatwoot | Self-hosted REST API + Webhook | Full control, no rate limits |

### Database Tables — Phase 1

```
events          ← every incoming message from all sources
decisions       ← every AI proposal + Lee's action
agent_memory    ← approval rate per agent per problem type
agent_skills    ← installable skills per agent (ready for Phase 4)
```

### Deployment Environments

```
Local     → Next.js dev + Supabase Docker + localhost
Staging   → Vercel preview on staging branch + Supabase staging project
Production → Vercel production on main branch + Supabase prod project
```

> No code goes directly to production. Every change: `feature/*` → `dev` → `staging` (QAQC) → `main` (Lee sign-off).

### Branch Strategy

```
main        ← production only, never push directly
staging     ← staging environment, auto-deploys to Vercel preview
dev         ← daily development
feature/*   ← individual features, branch from dev
```

---

## 8. Design Principles

> **War strategist's room. Not a SaaS dashboard.**
>
> Dark background. Glowing data. Precise typography. Everything feels like it is running live, right now.

### The Five Rules

1. **Information at a glance** — Lee understands the situation in 3 seconds
2. **Action in one click** — Lee approves, edits, or rejects in two clicks maximum
3. **Nothing wasted** — if it does not help Lee decide, it is not on screen
4. **Always alive** — real-time updates, live timestamps, connection status always visible
5. **Mobile-first** — Lee checks Nucleus on his phone, every interaction works on iPhone

### Design System Tokens

```css
/* Fonts */
--font-body:  'DM Sans', sans-serif
--font-mono:  'JetBrains Mono', monospace

/* Backgrounds */
--bg-base:     #080E1C   /* deepest background */
--bg-surface:  #0D1525   /* cards, panels */
--bg-elevated: #111D30   /* hover states */

/* Brand */
--coral:       #F2784B   /* primary CTA, BeLive brand */
--navy:        #1B2537

/* Status */
--p1:          #E05252   /* emergency */
--p2:          #E8A838   /* warning */
--p3:          #4BB8F2   /* info */
--success:     #4BF2A2   /* approved, resolved */

/* Agent identity */
--agent-ceo:   #9B6DFF
--agent-cfo:   #4BB8F2
--agent-coo:   #F2784B
--agent-cto:   #4BF2A2
```

---

## 9. Agent Development Setup

Nucleus uses Claude Code with a multi-agent architecture. Agents are specialized. Skills are modular. Quality gates are enforced at every stage.

### The Development Agent Team

| Agent | Owns |
|-------|------|
| Backend Agent | API routes, Lark/Chatwoot integrations, Anthropic calls |
| Frontend Agent | Dashboard UI, realtime subscriptions, war room aesthetic |
| Database Agent | Migration files, schema design, RLS policies |
| Reviewer Agent | Code quality gate before every merge |
| QAQC Agent | Product correctness gate at feature, integration, and pre-prod |
| PRD Agent | Three-audience documentation after every shipped feature |

### Skills Library

```
.claude/skills/
├── technical/
│   ├── supabase-migrations.md
│   ├── nextjs-api-routes.md
│   ├── supabase-realtime.md
│   ├── error-handling.md
│   ├── typescript-patterns.md
│   └── uiux.md
├── domain/
│   ├── belive-context.md
│   ├── lark-integration.md
│   ├── chatwoot-integration.md
│   └── anthropic-agents.md
└── ui-ux-pro-max/         ← industry standard UIUX skill
```

### Quality Gates

| Gate | Command | When | Checks |
|------|---------|------|--------|
| Code review | `/review` | Before every merge to dev | Types, errors, patterns, security |
| Feature QA | `/qaqc 1` | After feature merges to dev | Does it match PRD acceptance criteria? |
| Integration QA | `/qaqc 2` | Before dev → staging | Does everything work together? |
| Pre-prod sign-off | `/qaqc 3` | Before staging → main | Safe for real users? Lee approves. |
| Documentation | `/prd` | After every shipped feature | Three-audience docs generated |

### PRD Documentation Standard

Every shipped feature produces three documents:

- `product-spec.md` → for Lee and CJ (what, why, success metrics)
- `technical-spec.md` → for CTO and developers (architecture, APIs, schema)
- `feature-brief.md` → for Eason's ops team (what changed, what to do differently)

---

## 10. Success Metrics

### Phase 1 — 30 Days Post Launch

- 100% of Lark messages captured in Nucleus within 10 seconds
- 100% of Chatwoot messages captured within 10 seconds
- Lee approves or acts on decisions from Nucleus — not directly from Lark
- Zero missed messages — nothing falls through the cracks

### Phase 2 — 90 Days

- All four agents active and classifying correctly
- Lee's response time to team drops by 50%
- First problem types reaching 80%+ approval rate

### Phase 3 — 6 Months

- At least 3 problem types fully autonomous (95%+ approval rate)
- Lee handles 50% fewer direct messages — Twin handles the rest
- Zero incidents caused by autonomous decisions

### The North Star

> Lee logs into Nucleus every morning. Reviews overnight summary in 5 minutes. Approves the few decisions that need him. Closes the laptop. The company runs.

---

## 11. Risks and Constraints

### Key Risks

| Risk | Mitigation |
|------|-----------|
| Lark OAuth scope — sending as Lee's personal account requires specific OAuth permissions | Verify Lark enterprise tier early, test OAuth before building send layer |
| Agent misclassification early on | Monitor closely in first 2 weeks, manually reclassify and log corrections |
| Team awareness — team doesn't know Nucleus exists, thinks they're talking to Lee | By design, maintain carefully, never expose the system to team |
| Data privacy — all Lark and Chatwoot messages stored in Supabase | RLS correctly configured from day one, service key never exposed client-side |

### Constraints

- Phase 1 is Lee-only — no other users have access
- No autonomous execution until Phase 3 — every decision needs Lee approval in Phase 1
- Chatwoot is self-hosted — Lee's team controls the server, no external dependencies
- Claude model fixed at `claude-sonnet-4-6` — do not change without explicit decision
- All schema changes via migration files — never manual SQL in any environment

---

## 12. Key Decisions Made

These decisions were made during product design. They cannot be revisited without a PRD version update.

| Decision | What We Decided | Why |
|----------|----------------|-----|
| Standalone app | Nucleus is a separate app, not a BeLive OS module | Cleaner to build, faster to iterate, no legacy constraints |
| Sends as Lee | Messages send from Lee's personal Lark account, not a bot | Team authority — no "is this the bot?" confusion |
| No Head of Ops hire | COO Twin replaces the decision layer role | Build Twin first, hire only when data shows a specific gap |
| Supabase migrations | All schema changes via migration files, never manual SQL | Version controlled, reproducible across environments |
| Phase 1 = COO only | Only COO agent in Phase 1, others come in Phase 2 | Ops problems most frequent — validates the loop fastest |
| 95% autonomy gate | Problem types unlock autonomous mode at 95% approval | High bar ensures trust before removing human from loop |
| Self-hosted Chatwoot | Keep Chatwoot self-hosted, connect via REST API + webhook | Full control, no rate limits, no third-party dependency |
| Dark ops aesthetic | War room design — not SaaS dashboard, not admin panel | Matches the gravity of the decisions being made |

---

## Document Control

| Field | Value |
|-------|-------|
| Document | BeLive Nucleus PRD |
| Version | v1.0 |
| Created | April 2026 |
| Author | Lee Seng Hee |
| Next review | After Phase 1 ships |
| Location | `docs/NUCLEUS-PRD-v1.md` |

> This PRD is the source of truth for BeLive Nucleus. Any feature not in this document is out of scope. Any decision that contradicts this document requires a version update before work begins.

---

*Confidential — BeLive Property Hub*
