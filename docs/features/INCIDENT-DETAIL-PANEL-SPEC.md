# Incident Detail Panel — UIUX Redesign Spec v1.0

**Feature:** Incident Detail Panel Redesign
**Component:** components/command/IncidentDetail.tsx
**Status:** Planned
**Author:** Lee Seng Hee
**Date:** April 2026

---

## What This Fixes

| Problem | Fix |
|---------|-----|
| Thread looks like a log | Chronological vertical timeline with dots |
| @_user_1 placeholders | Real names resolved from Lark contact API |
| Reply goes to group standalone | Reply in Lark thread (root_id anchoring) |
| Proposed action truncated | Full text always visible in right panel |
| Panel cramped | Side-by-side split 60/40 |
| No @mention notifications | Proper Lark at_user tags on send |

---

## Layout — Side by Side (60/40)

```
┌────────────────────────────────────────────────────────────────────┐
│ ● C6  P2  COO  YELLOW              Cleaning complaint  6h ago  [X] │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  THREAD (60%)                  │  INTELLIGENCE (40%)              │
│  ─────────────────────────     │  ──────────────────────────────  │
│                                │                                  │
│  [timeline — see below]        │  AI Summary (collapsible)        │
│                                │  ──────────────────────────────  │
│                                │  Proposed Action (full, editable)│
│                                │  ──────────────────────────────  │
│                                │  Send as Lee                     │
│                                │  [reply in thread]               │
│                                │  ──────────────────────────────  │
│                                │  Actions                         │
│                                │  [Resolve] [Escalate] [Archive]  │
│                                │                                  │
└────────────────────────────────┴───────────────────────────────────┘
```

### Responsive behavior
- Desktop (>1200px): 60/40 side by side
- Tablet (768–1200px): 55/45 side by side
- Mobile (<768px): stacked, action panel sticky bottom

### Panel dimensions
- Full panel: 55% of screen width (existing behavior)
- Thread column: 60% of panel
- Intelligence column: 40% of panel, fixed position (no scroll)
- Thread column: scrollable independently

---

## Thread Column — Full Design

### Visual structure

```
THREAD

●──────────────────────────────────────────────────
│
│  [DL]  David Lim                    9:14am
│        OOE · C6
│
│        "Cleaning complaint unit AZR-A-13A-15.
│         @Mardhiah please looks into it. Can you
│         confirm all cleaning tasks were carried
│         out as per scheduled? Lets us know should
│         you need more support"
│
│                                        [📋 Copy]
│
●──────────────────────────────────────────────────
│
│  [MA]  Mardhiah                     9:22am
│        IOE · C6
│
│        "@David FYA"
│
│                                        [📋 Copy]
│
●  ⏸  45 min — no updates
│
●──────────────────────────────────────────────────
│
│  [MA]  Mardhiah                     10:07am
│        IOE · C6
│
│        "@_user_2 normally we fine the culprit?"
│
│                                        [📋 Copy]
│
●──────────────────────────────────────────────────
│
│  🤖  AI Summary                     10:10am
│
│      "Cleaning complaint at AZR-A-13A-15.
│       Mardhiah is aware but no confirmation
│       of task completion. Accountability
│       question raised."
│
●  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
│
│  ⚡  Lee Seng Hee                   10:15am
│      via Nucleus · replied in thread
│
│      "David — AZR-A-13A-15 cleaning complaint
│       flagged. Need your response within 2 hours:
│       1. Pull checklist — confirm what was
│          completed, which cleaner, timestamp
│       2. If any task missed or substandard,
│          rectify today before 6pm
│       3. Update me directly after"
│
●──────────────────────────────────────────────────
```

### Timeline line
- Thin vertical line: #1A2035 (muted border color)
- Dots: 8px circles
  - Regular message: #4B5A7A (muted)
  - Lee's message: #F2784B (coral)
  - AI summary: #9B6DFF (purple)
  - Silence gap: transparent (just the break text)
- Line connects all dots continuously

### Message bubble design
No bubble background. Clean flat design.

```
Layout per message:
[Avatar 32px]  [Name bold]  [Role muted small]  [Time muted small]
               [Message content — full width, no truncation]
               [Copy button — right aligned, appears on hover]
```

### Avatar
- 32px circle
- Lark profile photo (fetched from contact API)
- Fallback: initials with role-colored background
  IOE: #9B6DFF, OOE: #4BB8F2, Tech: #4BF2A2
  OM: #F2784B, Lee: #F2784B
- Cache photos in memory during session

### Name resolution
- Display: First name only for staff (space efficient)
  "David Lim" → "David"
  "Mardhiah Kamarudin" → "Mardhiah"
- Role label: role + cluster if relevant
  "IOE · C6", "OOE · C6", "Tech · C11"
- For unknowns: show truncated open_id in muted text

### @mention rendering
Parse message content for Lark mention tags:
```
Input:  "@<at user_id="ou_xxx">_user_1</at> please check"
Output: "@David please check" (name resolved, blue highlight)
```

If open_id not in staff directory:
→ Show "@unknown" in muted text

### Silence gap indicator
```
●  ⏸  45 min — no updates
```
- Centered, muted text
- ⏸ icon
- Amber color if > P1 silence threshold (1h)
- Red color if > P2 silence threshold (3h)

### Entry types

| Type | Left border | Dot color | Label |
|------|-------------|-----------|-------|
| message (staff) | none | #4B5A7A | name + role |
| message (lee) | #F2784B 2px | #F2784B | ⚡ Lee Seng Hee |
| silence_gap | none | none | ⏸ Xh Xm — no updates |
| ai_summary | #9B6DFF 2px | #9B6DFF | 🤖 AI Summary |
| escalation | #E05252 2px | #E05252 | ⚠️ Escalated |
| resolution | #4BF2A2 2px | #4BF2A2 | ✅ Resolved by [name] |
| system_note | none | #4B5A7A | italic muted |

### Thread footer
```
[↻ Refresh thread]    Last updated: 2 min ago
```
Realtime subscription active — new messages appear live.

---

## Intelligence Column — Full Design

### Section 1: Incident Header
```
● YELLOW   C6   P2   COO             6h ago
Cleaning complaint reported
AZR-A-13A-15 Azure Residence

Detected from: C6 — PJ Subang group
Source message: David Lim · 9:14am
```

### Section 2: AI Summary (collapsible)
```
▼ AI Summary                              [↻]

"Cleaning complaint at AZR-A-13A-15.
 Mardhiah is aware but no confirmation
 of task completion yet. Accountability
 question raised by Mardhiah — who is
 responsible. No resolution as of 10am."

Generated: 10:10am
```

Default: expanded
↻ regenerates summary on demand
Loading spinner while generating

### Section 3: Proposed Action (full text, editable)
```
Proposed Action                    Confidence: 88%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌────────────────────────────────────────────┐
│ David — AZR-A-13A-15 cleaning complaint   │
│ flagged. Need your response within 2       │
│ hours:                                     │
│                                            │
│ 1. Pull the checklist for this unit —     │
│    confirm what was completed and by       │
│    which cleaner, timestamp included       │
│2. If any task was missed or substandard,  │
│    rectify today before 6pm               │
│ 3. Update me directly after               │
└────────────────────────────────────────────┘

[✏️ Edit]
```

- Full text always visible, never truncated
- Editable textarea on [✏️ Edit] click
- Character count shown when editing
- "Edited" badge appears if changed from original

### Section 4: Send as Lee
```
Send as Lee                    Reply in thread ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌────────────────────────────────────────────┐
│ Type additional instruction...             │
│                                            │
│                                            │
└────────────────────────────────────────────┘
                                    0 / 500

Replying to: David Lim · "Cleaning complaint unit..."
Sending to: C6 group · as Lee Seng Hee

[✅ Approve & Send Proposed]    [📨 Send Custom]
```

Two send modes:
- **Approve & Send Proposed**: sends the proposed action text
- **Send Custom**: sends whatever is in the custom textarea

Both reply IN THREAD under the original trigger message.

After sending:
- Button shows "Sending..." spinner
- On success: "✓ Sent in thread" green confirmation
- New timeline entry appears in thread column

### Section 5: Actions (bottom of intelligence column)
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[✓ Resolve]    [↑ Escalate]    [🗄 Archive]
```

---

## Staff Directory System

### Supabase table: staff_directory

```sql
CREATE TABLE staff_directory (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  open_id text unique not null,
  lark_user_id text,
  name text not null,
  first_name text,
  email text,
  phone text,
  role text,
  -- IOE, OOE, Tech, OM, ED, CEO, CFO, CBO, Sales, Finance
  cluster text,
  -- C1-C11 or ALL for cross-cluster roles
  department text,
  avatar_url text,
  -- Lark profile photo URL (refreshed periodically)
  employee_code text,
  -- BLV-XX-XXXX format
  is_active boolean default true,
  last_synced_at timestamptz
);
```

Add indexes on open_id, role, cluster.

### lib/staff-directory.ts

```typescript
// In-memory cache for session
const nameCache = new Map<string, StaffMember>()
const photoCache = new Map<string, string>()

async function syncStaffFromLark(): Promise<void>
// Fetch all workspace members via Lark contact API
// GET /contact/v3/users?page_size=50
// For each user: extract open_id, name, department, avatar
// Upsert into staff_directory table
// Run once daily via cron

async function resolveOpenId(open_id: string): Promise<StaffMember | null>
// Check memory cache first
// Then check staff_directory table
// Then fetch from Lark API as fallback
// Cache result

async function resolveAllMentions(content: string): Promise<string>
// Parse Lark message content
// Find all <at user_id="ou_xxx"> tags
// Replace with @[real name]
// Return cleaned content

async function buildMentionTag(open_id: string): Promise<string>
// Returns Lark-formatted mention for sending:
// <at user_id="ou_xxx">Name</at>
// Used when Lee sends a message with @mentions

async function getAvatarUrl(open_id: string): Promise<string>
// Returns Lark profile photo URL
// Cached in staff_directory.avatar_url
// Fallback: generate initials avatar URL

function getInitialsColor(role: string): string
// Returns color for initials avatar based on role
// IOE: #9B6DFF, OOE: #4BB8F2, Tech: #4BF2A2
// OM: #F2784B, ED/CEO: #F2784B, Sales: #E8A838
```

### Staff seeding

On first run, sync from Lark workspace.
Also manually seed known staff with employee codes:

```sql
-- Key staff pre-seeded
-- Lee: ou_af2a40628719440234aa29656d06d322
-- Fatihah: open_id from Lark
-- Adam: open_id from Lark
-- etc.
-- Full list from 95-employee registry (BLV codes)
```

### Cron: daily staff sync
```
Every day at 2am MYT:
  syncStaffFromLark()
  Refresh avatar URLs
  Mark inactive users
```

---

## Reply-in-Thread Logic

### How Lark thread replies work

```typescript
// Reply in thread = set reply_in_thread: true + root_id
const response = await fetch(
  'https://open.larksuite.com/open-apis/im/v1/messages',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${leeUserToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      receive_id_type: 'chat_id',
      receive_id: incident.chat_id,
      msg_type: 'text',
      content: JSON.stringify({
        text: messageContent  // with @mention tags
      }),
      reply_in_thread: true,
      root_id: incident.source_lark_message_id  // original trigger message
    })
  }
)
```

The team sees Lee's reply threaded under the original message.
They get notified because they're mentioned or part of the thread.

### @mention in outgoing messages

When Lee types "David check this" in the send box:
- Nucleus detects "David" → looks up open_id → inserts mention tag
- Final message: "David <at user_id="ou_xxx">David</at> check this"
- David gets a Lark notification

Auto-mention detection:
- If message references a name in staff_directory → auto-insert mention
- Show preview: "Mentioning: @David Lim, @Mardhiah"
- Lee can remove mentions before sending

### Fallback if root_id unavailable
If source_lark_message_id is null (manually created incident):
→ Send as regular group message (not threaded)
→ Show warning: "Sending as group message — no source thread"

---

## Updated API Routes

### Update: app/api/incidents/[id]/reply/route.ts

```typescript
POST handler:
Body: { content: string, use_proposed?: boolean }

1. Get incident (need chat_id + source_lark_message_id)
2. If use_proposed: content = incident.ai_proposal
3. Resolve @mentions in content:
   - Parse name references
   - Replace with <at user_id="..."> tags
4. Get Lee's user token
5. Send to Lark:
   receive_id: incident.chat_id
   content: resolved content
   reply_in_thread: true
   root_id: incident.source_lark_message_id
6. Add to incident_timeline:
   entry_type: 'lee_instruction'
   content: original content (before mention tag insertion)
   is_lee: true
   metadata: { sent_as_thread_reply: true, root_id: ... }
7. Update incident: has_lee_replied: true
8. Return { ok: true, message_id, sent_at }
```

### New: app/api/staff/route.ts

```
GET handler:
  Returns all active staff from staff_directory
  Includes: open_id, name, first_name, role, cluster, avatar_url

GET /api/staff/sync
  Triggers syncStaffFromLark()
  Protected by NUCLEUS_SECRET
```

### New: app/api/staff/[open_id]/route.ts

```
GET handler:
  Returns single staff member
  Resolves avatar URL if not cached
```

---

## Frontend Components

### components/command/IncidentDetail.tsx (full rewrite)

Layout:
```typescript
// Main container
<div className="flex h-full">
  <ThreadColumn incident={incident} timeline={timeline} />
  <IntelligenceColumn incident={incident} onUpdate={refetch} />
</div>
```

### components/command/ThreadColumn.tsx (new)

Props: { incident: Incident, timeline: IncidentTimeline[] }

```typescript
// Fetch staff directory on mount for name resolution
// Subscribe to incident_timeline realtime
// Render vertical timeline

function ThreadColumn({ incident, timeline }) {
  const { staff } = useStaffDirectory()

  return (
    <div className="thread-column">
      <div className="thread-header">
        <span>Thread</span>
        <span className="text-muted">
          {timeline.length} messages
        </span>
        <RefreshButton />
      </div>

      <div className="timeline-scroll">
        <div className="timeline-line" />
        {timeline.map((entry, i) => (
          <TimelineEntry
            key={entry.id}
            entry={entry}
            staff={staff}
            showSilenceGap={getSilenceGap(timeline, i)}
          />
        ))}
      </div>

      <div className="thread-footer">
        Last updated: {formatTimeAgo(lastEntry?.created_at)}
      </div>
    </div>
  )
}
```

### components/command/TimelineEntry.tsx (new)

Renders a single timeline entry based on entry_type.

```typescript
function TimelineEntry({ entry, staff, showSilenceGap }) {
  const sender = staff[entry.sender_open_id]
  const resolvedContent = resolveMentions(entry.content, staff)

  if (entry.entry_type === 'silence_gap') {
    return <SilenceGapEntry entry={entry} />
  }

  if (entry.entry_type === 'ai_summary') {
    return <AISummaryEntry entry={entry} />
  }

  return (
    <div className={`timeline-entry ${entry.is_lee ? 'lee' : ''}`}>
      <div className="timeline-dot" />
      <Avatar
        src={sender?.avatar_url}
        fallback={getInitials(sender?.name)}
        color={getRoleColor(sender?.role)}
        size={32}
      />
      <div className="message-content">
        <div className="message-header">
          <span className="sender-name">
            {sender?.first_name ?? 'Unknown'}
          </span>
          <span className="sender-role">
            {sender?.role} {sender?.cluster && `· ${sender.cluster}`}
          </span>
          <span className="timestamp">
            {formatTime(entry.created_at)}
          </span>
        </div>
        <div className="message-text">
          {renderMentions(resolvedContent)}
        </div>
        <CopyButton text={entry.content} />
      </div>
    </div>
  )
}
```

### components/command/IntelligenceColumn.tsx (new)

Props: { incident: Incident, onUpdate: () => void }

Sections:
1. IncidentHeader — status, cluster, priority, age, title
2. AISummarySection — collapsible, regenerate button
3. ProposedActionSection — full text, editable
4. SendAsLeeSection — custom textarea + two send buttons
5. ActionsSection — resolve, escalate, archive

### components/command/SendAsLee.tsx (new)

```typescript
function SendAsLee({ incident, onSent }) {
  const [customText, setCustomText] = useState('')
  const [mentionPreview, setMentionPreview] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  // Detect @names in custom text and show preview
  useEffect(() => {
    const mentions = detectMentions(customText, staffDirectory)
    setMentionPreview(mentions)
  }, [customText])

  async function sendProposed() {
    setSending(true)
    await fetch(`/api/incidents/${incident.id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ use_proposed: true })
    })
    setSending(false)
    setSent(true)
    onSent()
  }

  async function sendCustom() {
    if (!customText.trim()) return
    setSending(true)
    await fetch(`/api/incidents/${incident.id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content: customText })
    })
    setSending(false)
    setSent(true)
    setCustomText('')
    onSent()
  }

  return (
    <div className="send-as-lee">
      <div className="send-header">
        <span>Send as Lee</span>
        <span className="thread-badge">Reply in thread ✓</span>
      </div>

      <div className="reply-context">
        Replying to: {triggerSenderName} · "{truncate(triggerMessage, 40)}"
      </div>

      <textarea
        value={customText}
        onChange={e => setCustomText(e.target.value)}
        placeholder="Type additional instruction..."
        maxLength={500}
      />

      {mentionPreview.length > 0 && (
        <div className="mention-preview">
          Mentioning: {mentionPreview.join(', ')}
        </div>
      )}

      <div className="char-count">{customText.length} / 500</div>

      {sent ? (
        <div className="sent-confirmation">✓ Sent in thread</div>
      ) : (
        <div className="send-buttons">
          <button onClick={sendProposed} disabled={sending}>
            {sending ? 'Sending...' : '✅ Approve & Send Proposed'}
          </button>
          <button
            onClick={sendCustom}
            disabled={sending || !customText.trim()}
          >
            📨 Send Custom
          </button>
        </div>
      )}
    </div>
  )
}
```

---

## CSS / Design Details

### Timeline line
```css
.timeline-line {
  position: absolute;
  left: 16px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #1A2035;
}

.timeline-dot {
  position: absolute;
  left: 12px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4B5A7A;
}

.timeline-entry.lee .timeline-dot {
  background: #F2784B;
  box-shadow: 0 0 6px rgba(242, 120, 75, 0.5);
}
```

### Lee message highlight
```css
.timeline-entry.lee {
  border-left: 2px solid #F2784B;
  padding-left: 12px;
  background: rgba(242, 120, 75, 0.04);
  border-radius: 4px;
}
```

### Silence gap
```css
.silence-gap {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #4B5A7A;
  font-size: 12px;
  padding: 8px 0;
}

.silence-gap.warning { color: #E8A838; }
.silence-gap.critical { color: #E05252; }
```

### Mention highlighting
```css
.mention {
  color: #4BB8F2;
  font-weight: 500;
}
```

### Intelligence column
```css
.intelligence-column {
  width: 40%;
  min-width: 300px;
  border-left: 1px solid #1A2035;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
```

### Proposed action textarea
```css
.proposed-action-text {
  background: #080E1C;
  border: 1px solid #1A2035;
  border-radius: 6px;
  padding: 12px;
  font-size: 13px;
  line-height: 1.6;
  color: #E8EEF8;
  width: 100%;
  resize: none;
  min-height: 120px;
}
```

---

## Files to Create

```
components/command/ThreadColumn.tsx
components/command/TimelineEntry.tsx
components/command/IntelligenceColumn.tsx
components/command/SendAsLee.tsx
components/command/AISummarySection.tsx
components/command/ProposedActionSection.tsx
components/common/Avatar.tsx          ← reusable avatar component
components/common/CopyButton.tsx      ← reusable copy button

lib/staff-directory.ts                ← sync + resolve + cache
lib/mention-resolver.ts               ← parse + replace @mentions

app/api/staff/route.ts
app/api/staff/[open_id]/route.ts
app/api/staff/sync/route.ts
```

## Files to Update

```
components/command/IncidentDetail.tsx ← full rewrite using new components
app/api/incidents/[id]/reply/route.ts ← add thread reply + mention resolution
app/api/cron/route.ts                 ← add daily staff sync
supabase migration                    ← staff_directory table
```

---

## Cron Additions

```
Daily at 2am MYT (18:00 UTC):
  GET /api/staff/sync
  Syncs Lark workspace members to staff_directory
```

Add to vercel.json:
```json
{ "path": "/api/cron/staff-sync", "schedule": "0 18 * * *" }
```

---

## Testing Plan

### Step 1 — Staff Directory
```sql
-- After migration, trigger sync
curl -X GET https://belive-nucleus.vercel.app/api/staff/sync \
  -H "x-nucleus-secret: belive_nucleus_2026"

-- Check staff_directory table populated
-- Verify avatar_urls are valid Lark photo URLs
-- Test name resolution: ou_af2a40628719440234aa29656d06d322 → Lee Seng Hee
```

### Step 2 — Thread Column UI
```
Open /command
Click any incident with thread messages
Verify:
  ✅ Vertical timeline line renders
  ✅ Real names shown (not open_ids)
  ✅ Lark profile photos load
  ✅ @mentions resolved and highlighted in blue
  ✅ Silence gaps shown correctly
  ✅ Lee's messages styled with coral border
  ✅ Full message text — no truncation
  ✅ Copy button appears on hover
```

### Step 3 — Intelligence Column
```
Verify:
  ✅ AI summary collapsible, regenerates on ↻
  ✅ Proposed action full text visible
  ✅ Edit button makes it editable
  ✅ "Reply in thread ✓" badge shows
  ✅ Reply context shows trigger sender + message
```

### Step 4 — Reply in Thread
```
1. Open incident in /command
2. Type custom message in Send as Lee box
3. Include a staff name e.g. "David check this"
4. Verify mention preview shows "@David Lim"
5. Click Send Custom
6. Open Lark → go to C6 group
7. Find original trigger message
8. Verify Lee's reply appears UNDER the message as a thread
9. Verify David got a Lark mention notification
```

### Step 5 — Approve & Send Proposed
```
1. Click "Approve & Send Proposed"
2. Verify proposed action text sent to Lark
3. Verify it's a thread reply (not standalone)
4. Verify timeline entry appears in thread column
5. Verify incident status → 'acting'
```

### Step 6 — Realtime
```
Send a message in the cluster group from another device
Verify: new message appears in thread column without refresh
```

---

## Done Criteria

- [ ] staff_directory table created and synced from Lark
- [ ] Real names resolve from open_ids in thread
- [ ] Lark profile photos load as avatars
- [ ] Initials fallback with role colors works
- [ ] @mentions resolved to real names in blue
- [ ] Panel layout is 60/40 side by side
- [ ] Thread has vertical timeline line with dots
- [ ] Full message text — never truncated
- [ ] Silence gaps shown with correct timing colors
- [ ] Lee messages styled with coral left border
- [ ] AI summary collapsible with regenerate button
- [ ] Proposed action always full text, editable
- [ ] "Reply in thread" badge visible in send section
- [ ] Approve & Send sends as thread reply in Lark
- [ ] Send Custom sends as thread reply in Lark
- [ ] @mention detection in outgoing message
- [ ] Mention preview shows before sending
- [ ] Timeline updates live (realtime subscription)
- [ ] Copy button works on each message
- [ ] Mobile: stacked layout with sticky action
- [ ] Daily staff sync cron configured
- [ ] Zero TypeScript errors
- [ ] Deployed to production
