# BeLive Nucleus — Technical Specification v2.0

**Date:** 7 April 2026
**Stack:** Next.js 15 (App Router) + TypeScript + Supabase + Anthropic Claude + Vercel
**Repository:** github.com/senghee27/belive-nucleus
**Commits:** 70 (as of 7 Apr 2026)

---

## 1. Architecture Overview

```
                    ┌──────────────┐
                    │   Vercel      │
                    │   (Hosting)   │
                    └──────┬───────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
     ┌──────┴──────┐ ┌────┴────┐  ┌─────┴─────┐
     │ Next.js App  │ │ API     │  │ Cron Jobs │
     │ (SSR + CSR)  │ │ Routes  │  │ (Vercel)  │
     └──────┬──────┘ └────┬────┘  └─────┬─────┘
            │              │              │
     ┌──────┴──────────────┴──────────────┴──────┐
     │              Supabase (Postgres)           │
     │     + Realtime Subscriptions + RLS         │
     └──────┬──────────────┬──────────────┬──────┘
            │              │              │
     ┌──────┴──────┐ ┌────┴────┐  ┌─────┴─────┐
     │ Lark API     │ │ Claude  │  │ Web Push  │
     │ (Webhook +   │ │ Sonnet  │  │ (VAPID)   │
     │  OAuth OIDC) │ │ 4.6     │  │           │
     └─────────────┘ └─────────┘  └───────────┘
```

### Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| App Router only (no Pages Router) | Modern Next.js patterns, server components |
| Supabase lazy proxy (supabase-admin.ts) | Prevents server-only imports leaking to client bundle |
| JWT sessions (jose HS256) | Lightweight, no session store needed |
| `after()` for async webhook processing | Return 200 immediately, process in background |
| Safety gate (TEST_MODE) | All outbound redirected to test group during development |
| User token only (no bot fallback) | Messages always sent as Lee, clear error on expiry |

---

## 2. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js | 15 |
| Language | TypeScript | strict |
| Database | Supabase (Postgres) | latest |
| AI | Anthropic Claude API | claude-sonnet-4-6 |
| Styling | Tailwind CSS | v4 |
| Animation | framer-motion, @react-spring/web | latest |
| Gestures | @use-gesture/react | latest |
| Push | web-push (VAPID) | latest |
| Auth | jose (JWT HS256) | latest |
| Deployment | Vercel (Hobby plan) | auto |
| Cron | Vercel Cron (daily limit) | 3 daily jobs |

---

## 3. File Structure

```
belive-nucleus/
├── app/
│   ├── (dashboard)/           # Desktop routes (protected by middleware)
│   │   ├── overview/          # Home — morning greeting + stats
│   │   ├── command/           # War Room table + [id] detail
│   │   ├── clusters/          # Health Wall v2 (category/command views)
│   │   ├── briefings/         # Schedule tab + Reports tab + [id] detail
│   │   ├── groups/            # Monitored group management
│   │   ├── schedules/         # Scan schedules
│   │   ├── watchdog/          # Activity log
│   │   └── settings/          # Staff directory
│   ├── m/                     # Mobile PWA routes
│   │   ├── page.tsx           # Urgent tab
│   │   ├── queue/             # Swipe-to-approve
│   │   ├── clusters/          # Cluster health dots + cards
│   │   └── reports/           # Report list + reader sheet
│   ├── auth/                  # Login + denied pages
│   └── api/                   # 50+ API routes
│       ├── events/lark/       # Webhook handler (real-time)
│       ├── events/chatwoot/   # Chatwoot webhook
│       ├── incidents/         # CRUD + decide + reply + test-send
│       ├── clusters/          # Health + scan + refresh-summary
│       ├── briefings/         # Reports + schedule + autosend + cron-runs
│       ├── m/                 # Mobile-specific endpoints
│       ├── push/              # Push subscribe + send
│       ├── cron/              # Vercel cron handler
│       └── auth/              # Lark OAuth callback + logout
├── components/
│   ├── command/               # CommandCenter, IncidentDetail, IncidentPage
│   ├── clusters/              # ClusterHealthWall v2, CategoryView, CommandView
│   ├── briefings/             # ReportFeed, ReportDetail, ScheduleTab, AutoSendDrawer
│   ├── mobile/                # BottomNav, QueueSwiper, BottomSheet, etc.
│   ├── layout/                # Sidebar, Header
│   ├── groups/                # GroupsManager
│   ├── schedules/             # SchedulesManager
│   └── watchdog/              # WatchdogFeed
├── lib/
│   ├── incidents.ts           # Classification, proposals, decisions (core engine)
│   ├── lark.ts                # Send messages (safety gate, user token only)
│   ├── lark-tokens.ts         # OAuth tokens (tenant + user + refresh)
│   ├── scanner.ts             # Group message scanning engine
│   ├── cluster-health.ts      # Health score computation
│   ├── activity-logger.ts     # Watchdog event logging
│   ├── staff-directory.ts     # Staff name resolution (cache + DB + Lark API)
│   ├── auth.ts                # JWT sessions, Lark OAuth
│   ├── briefings/             # Report generators + cron logger + confidence
│   ├── clusters/              # AI summary generation
│   └── types.ts               # All TypeScript types
├── middleware.ts               # Auth + mobile detection + route protection
├── public/
│   ├── manifest.json          # PWA manifest
│   ├── sw.js                  # Service worker (push notifications)
│   └── icons/                 # PWA icons
└── supabase/migrations/       # 19 migration files
```

---

## 4. Database Schema (19 migrations)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| incidents | Every classified issue | id, title, category, severity, priority, status, cluster, ai_proposal, ai_confidence, sender_name |
| incident_timeline | Conversation thread per incident | incident_id, entry_type, content, sender_name, is_lee |
| monitored_groups | Which Lark groups are scanned | chat_id, cluster, group_type, scanning_enabled, context |
| lark_group_messages | All captured Lark messages | message_id, cluster, content, sender_name, processed |
| cluster_health_cache | Pre-computed health per cluster | cluster, health_score, health_status, ai_summary, top_blockers, top_maintenance/cleaning/movein/moveout |
| briefing_reports | Every generated report | report_type, content, content_original, status, destinations, generation_log, lee_edited, was_auto_sent |
| briefing_autosend_config | Confidence tracking per report type | report_type, consecutive_approvals, auto_send_enabled, auto_send_eligible |
| briefing_cron_runs | Every cron execution logged | report_type, status, duration_seconds, sources_attempted/succeeded/failed, tokens_used |
| briefing_schedule_config | Schedule config per report type | report_type, cron_expression, enabled, last_run_at, success_rate |
| staff_directory | Staff name resolution | open_id, name, first_name, role, cluster, avatar_url |
| nucleus_activity_log | Watchdog events | event_type, summary, detail, cluster, success |
| ai_report_tickets | Parsed BLV-RQ tickets | ticket_id, cluster, unit_number, issue_description, age_days, sla_overdue |
| scan_logs | Scan execution history | cluster, messages_found, issues_detected, duration_ms |
| scan_schedules | Configurable scan jobs | skill, cron_expression, enabled |
| standup_sessions | Daily standup tracking | session_date, cluster, compliance_status, report_extracted |
| daily_messages | Outbound messages log | cluster, message_type, content_text, content_card_json |
| lark_tokens | OAuth token storage | token_type, access_token, refresh_token, expires_at |
| push_subscriptions | Web push endpoints | endpoint, p256dh, auth, user_id, active |

---

## 5. API Contracts (Key Endpoints)

### Incidents
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/incidents | List all (filters: status, cluster, severity, limit) |
| POST | /api/incidents | Create from manual input |
| GET | /api/incidents/[id] | Single incident + timeline |
| POST | /api/incidents/[id]/decide | Lee approves/edits/rejects |
| POST | /api/incidents/[id]/reply | Send as Lee to Lark (thread-aware) |
| POST | /api/incidents/[id]/test-send | Send to Testing Group only |

### Clusters
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/clusters | All cluster health data |
| POST | /api/clusters/scan | Scan groups + compute health (?cluster= for single) |
| POST | /api/clusters/compute | Compute health scores only |
| POST | /api/clusters/[id]/refresh-summary | Regenerate AI summary |

### Briefings
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/briefings | List reports (filters: type, status, cluster) |
| POST | /api/briefings | Generate on-demand report |
| GET | /api/briefings/[id] | Single report with resolved destinations |
| PATCH | /api/briefings/[id] | Edit content (sets lee_edited) |
| DELETE | /api/briefings/[id] | Discard (resets confidence) |
| POST | /api/briefings/[id]/send | Send to selected destinations |
| POST | /api/briefings/[id]/reset | Reset to AI original |
| POST | /api/briefings/send-batch | Send multiple reports |
| GET | /api/briefings/schedule | All schedule configs + stats |
| POST | /api/briefings/schedule/[type]/run | Trigger manual generation |
| POST | /api/briefings/schedule/[type]/retry | Retry last failed run |
| GET/PATCH | /api/briefings/autosend | Config auto-send toggles |

### Webhooks
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /api/events/lark | Lark webhook (im.message.receive_v1) |
| POST | /api/events/chatwoot | Chatwoot webhook |

### Mobile
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/m/summary | Home tab data (P1s, counts, cluster dots) |
| GET | /api/m/queue | Awaiting_lee incidents for swipe |
| POST | /api/m/incidents/[id]/decide | Mobile approve/skip/discard |

---

## 6. Integrations

### Lark
- **Webhook**: im.message.receive_v1 → /api/events/lark (challenge verification + async processing)
- **OAuth OIDC**: Login via Lark app (auto-detect code in URL)
- **User Token**: Lee's personal token for sending messages as himself
- **Tenant Token**: Bot token for reading contacts, group info
- **Contact API**: Staff directory sync (name, department, avatar)
- **Interactive Cards**: Pre-standup briefs and OCC reviews sent as Lark v7 cards

### Anthropic Claude
- **Model**: claude-sonnet-4-6 (fixed, all agents)
- **Usage**: Classification (300 tokens), proposals (1024), briefings (800-1200), cluster summaries (120)
- **JSON parsing**: `parseAIJson()` strips markdown backtick wrappers

### Supabase
- **Realtime**: subscriptions on incidents, cluster_health_cache, briefing_reports, briefing_cron_runs
- **RLS**: service_role_all policy on all tables (Lee-only app)
- **Admin client**: Lazy proxy pattern prevents server-only import leaks

### Web Push
- **VAPID keys**: Generated and stored in Vercel env vars
- **Service worker**: /public/sw.js handles push events + notification clicks
- **Triggers**: P1 incidents, new reports, queue updates

---

## 7. Security

- All routes protected by JWT middleware (except webhooks + cron)
- Webhooks authenticated by Lark challenge verification
- Secret routes (API) authenticated by x-nucleus-secret header
- Session cookies: HttpOnly, Secure, SameSite=Lax
- 3 allowed open_ids for Lee (different per Lark app context)
- Service key never exposed client-side (lazy proxy pattern)
- TEST_MODE safety gate prevents accidental real sends

---

## 8. How to Run Locally

```bash
git clone github.com/senghee27/belive-nucleus
cd belive-nucleus
npm install
cp .env.example .env.local   # fill in keys
npm run dev                   # http://localhost:3000
```

Required env vars:
```
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_KEY
LARK_APP_ID
LARK_APP_SECRET
ANTHROPIC_API_KEY
NUCLEUS_SECRET
LEE_LARK_CHAT_ID
JWT_SECRET
NEXT_PUBLIC_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
```

---

## 9. Known Limitations

- Vercel Hobby plan: daily cron only (3 schedules consolidated)
- Lark user token expires every 2 hours — Lee must re-login periodically
- No multi-user support — Lee is the only authenticated user
- AI classification can miscategorize — manual reclassification not yet built
- PWA icons are 1x1 pixel placeholders — need real designed icons
- Chatwoot integration exists but not actively used
- TEST_MODE is currently ON — real cluster sends require manual toggle
- No offline data persistence in mobile PWA (NetworkFirst caching only)

---

*Confidential — BeLive Property Hub / Spacify Technologies*
