@AGENTS.md

# BeLive Nucleus — Claude Code Project Bible

## What This Project Is
BeLive Nucleus is a standalone AI-powered command center for Lee Seng Hee, 
Founder & Group CEO of BeLive Property Hub. It connects Lark, Chatwoot, 
and BeLive OS into a unified intelligence layer with four AI agents 
(CEO, CFO, COO, CTO) that learn Lee's decision-making over time.

## Company Context
- BeLive Property Hub: co-living property management, Malaysia
- 3,000 rooms, 55+ condos, KL / Penang / Johor Bahru
- Leadership: Eason (Operations), Keith (Revenue), CJ (Business), Brittany (Sales)
- All staff use Lark for communication
- External comms via Chatwoot (self-hosted)
- Internal ops via BeLive OS (Next.js + Supabase)

## Tech Stack
- Framework: Next.js 15, App Router, TypeScript
- Database: Supabase (Postgres)
- Styling: Tailwind CSS v4
- AI: Anthropic Claude API (claude-sonnet-4-6)
- Auth: NextAuth or Supabase Auth
- Deployment: Vercel
- Version control: GitHub

## Architecture Principles
- App Router only — no Pages Router
- Server Components by default — Client Components only when necessary
- All database changes via migration files in supabase/migrations/
- Never write raw SQL in application code — use Supabase client
- Environment variables via .env.local locally, Vercel env vars in cloud
- Never commit secrets

## Branch Strategy
- main → production
- staging → staging environment
- dev → daily development
- feature/* → individual features, branch from dev

## Database Rules
- NEVER modify supabase/migrations files that already exist
- New schema changes = new migration file always
- Run: supabase db reset to apply migrations locally
- Migration naming: YYYYMMDDHHMMSS_description.sql

## Code Style
- Functional components only, no class components
- Named exports for components, default exports for pages
- Types over interfaces where possible
- No any types — always type properly
- Error handling on every async function
- Loading and error states on every data fetch

## File Structure
belive-nucleus/
├── app/
│   ├── (auth)/login/
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── inbox/
│   └── api/
│       ├── events/lark/
│       ├── events/chatwoot/
│       ├── events/belive/
│       └── decisions/[id]/approve/
├── components/
│   ├── inbox/
│   ├── layout/
│   └── ui/
├── lib/
│   ├── supabase.ts
│   ├── lark.ts
│   ├── chatwoot.ts
│   └── agents/
│       ├── classify.ts
│       ├── propose.ts
│       └── memory.ts
├── supabase/
│   └── migrations/
├── .claude/
│   ├── agents/
│   └── commands/
├── CLAUDE.md
└── .env.example

## Design System
- Font: DM Sans (body) + JetBrains Mono (code/data)
- Primary: #F2784B (coral)
- Navy: #1B2537
- Background: #080E1C
- Surface: #0D1525
- Border: #1A2035
- Success: #4BF2A2
- Warning: #E8A838
- Error: #E05252

## Current Phase
Phase 1 — Inbox + Decision Engine
- Lark webhook listener
- Chatwoot webhook listener
- AI classification (CEO/COO agent)
- Decision proposal + approve/reject
- Decision logged to memory

## Skills Available

When working on specific tasks, load the relevant skill first:

Technical skills:
- .claude/skills/technical/supabase-migrations.md → any DB work
- .claude/skills/technical/api-routes.md → any API route
- .claude/skills/technical/realtime.md → realtime features
- .claude/skills/technical/error-handling.md → always load this
- .claude/skills/technical/typescript-patterns.md → always load this

Domain skills:
- .claude/skills/domain/belive-context.md → always load this
- .claude/skills/domain/lark-integration.md → any Lark work
- .claude/skills/domain/chatwoot-api.md → any Chatwoot work
- .claude/skills/domain/anthropic-api.md → any AI agent work

## Skill Loading Instruction
At the start of every task, state which skills you are loading
and confirm you have read them before writing any code.

## UI/UX Skill

UI/UX Pro Max is installed at .claude/skills/ui-ux-pro-max/

Before building ANY frontend component or page:
1. Run search.py with relevant keywords (style, product type, ux, typography)
2. Generate or read design-system/MASTER.md
3. Check if design-system/pages/[page-name].md exists
4. Implement using those exact tokens — never deviate

Stack flag to always use: --stack nextjs

BeLive Nucleus aesthetic keywords:
"command center", "dark ops", "real-time", "war room", "data dense"

## What Is NOT Built Yet
- Auth (coming Phase 2)
- CFO / CTO agents (coming Phase 2)
- BeLive OS webhook (coming Phase 2)
- Autonomy / auto-execute (coming Phase 3)
- Skills system (coming Phase 4)
