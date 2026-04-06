# Cluster Health Wall Redesign — Spec v2.0

**Feature:** Cluster Health Wall — Full Redesign
**Route:** /clusters
**Status:** Planned
**Author:** Lee Seng Hee
**Date:** April 2026

---

## Philosophy

```
The wall is not a table of numbers.
The wall is a situation board.

Numbers answer: "How many?"
The wall must answer: "What specifically? Who owns it? How long?"

Within 3 seconds per cluster card:
  Lee knows the exact blockers
  Lee knows who is responsible
  Lee knows how overdue it is

Scan 4 clusters in 12 seconds.
All 11 clusters in 33 seconds.
Done. Back to commanding.
```

---

## Confirmed Decisions

| Decision | Choice |
|----------|--------|
| Cards visible at once | 4 (natural, CSS-driven) |
| Scroll behaviour | Free smooth scroll + dot navigation |
| Default view | Category Strips (View B) |
| Second view | Command / AI Summary (View A+D) |
| View switching | All 11 cards switch simultaneously |
| Card height | Fixed (100vh - header - padding) |
| Side panel | Existing enhanced side panel |
| AI summary | Generated at scan time, cached per cluster |

---

## Card Dimensions

```
Width:  calc((100vw - 56px sidebar - 48px padding) / 4)
        ≈ 335px on 1440px screen
        ≈ 305px on 1280px screen
        ≈ 330px on 1440px with scrollbar

Height: calc(100vh - 120px)
        Fixed. No exceptions. Content fits within.
        ≈ 820px on 1080px screen
        ≈ 700px on 900px screen

Gap between cards: 12px
Horizontal padding: 16px each side
```

---

## Database Additions

### Add to cluster_health_cache:

```sql
ALTER TABLE cluster_health_cache ADD COLUMN IF NOT EXISTS
  ai_summary text,
  -- AI-generated 2-3 line cluster situation summary
  -- Generated during scan, cached

  ai_summary_generated_at timestamptz,
  -- When the summary was last generated

  top_blockers jsonb default '[]',
  -- Pre-computed top 3 blockers for Command view
  -- [{ id, title, category, age_days, owner_name, unit, sla_overdue }]

  top_maintenance jsonb default '[]',
  -- Top 3 maintenance tickets (most overdue + most recent)
  -- [{ id, ticket_id, title, age_days, owner_name, unit, sla_overdue }]

  top_cleaning jsonb default '[]',
  -- Top 2 cleaning tickets
  top_movein jsonb default '[]',
  -- Top 2 move-in items
  top_moveout jsonb default '[]';
  -- Top 2 turnaround items
```

These are computed at scan time and cached. The UI reads from cache — no per-render queries against incidents table.

---

## AI Summary Generation

### lib/clusters/generate-cluster-summary.ts

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase'

const client = new Anthropic()

interface ClusterData {
  cluster: string
  cluster_name: string
  maintenance_items: {
    title: string
    age_days: number
    owner_name: string
    unit: string
    sla_overdue: boolean
    ticket_id: string
  }[]
  cleaning_items: typeof maintenance_items
  movein_items: typeof maintenance_items
  moveout_items: typeof maintenance_items
  total_maintenance: number
  total_cleaning: number
  total_movein: number
  total_moveout: number
  sla_breaches: number
}

export async function generateClusterAISummary(
  data: ClusterData
): Promise<string> {
  const contextText = `
Cluster: ${data.cluster} — ${data.cluster_name}

MAINTENANCE (${data.total_maintenance} total, ${data.sla_breaches} SLA breaches):
${data.maintenance_items.slice(0, 5).map(i =>
  `- ${i.title} | ${i.age_days}d | ${i.owner_name} | Unit: ${i.unit} ${i.sla_overdue ? '[OVERDUE]' : ''}`
).join('\n')}

CLEANING (${data.total_cleaning} total):
${data.cleaning_items.slice(0, 3).map(i =>
  `- ${i.title} | ${i.age_days}d | ${i.owner_name}`
).join('\n')}

MOVE IN (${data.total_movein} total):
${data.movein_items.slice(0, 3).map(i =>
  `- ${i.title} | ${i.age_days}d | ${i.owner_name}`
).join('\n')}

TURNAROUND (${data.total_moveout} total):
${data.moveout_items.slice(0, 3).map(i =>
  `- ${i.title} | ${i.age_days}d | ${i.owner_name}`
).join('\n')}
`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 120,
    messages: [{
      role: 'user',
      content: `You are Chief of Staff briefing the CEO on cluster ${data.cluster} — ${data.cluster_name}.

${contextText}

Write exactly 2-3 sentences (max 200 characters total) that:
1. Identify any PATTERN or CONNECTION between issues (same unit, same tenant, same staff)
2. Name the staff member with the most concentration of open/overdue items
3. State ONE specific action needed TODAY

Rules:
- Be specific: name units, ticket IDs, staff names
- Never say "there are X tickets" — show insight, not counts
- Sound decisive, like a military briefing
- If issues are connected, say so explicitly
- If one staff member dominates the workload, call it out

Output only the 2-3 sentences. Nothing else.`
    }]
  })

  return response.content[0].type === 'text'
    ? response.content[0].text.trim()
    : 'Summary unavailable.'
}

// Compute top blockers (most critical regardless of category)
export function computeTopBlockers(data: ClusterData) {
  const all = [
    ...data.maintenance_items.map(i => ({ ...i, category: 'maintenance' })),
    ...data.cleaning_items.map(i => ({ ...i, category: 'cleaning' })),
    ...data.movein_items.map(i => ({ ...i, category: 'movein' })),
    ...data.moveout_items.map(i => ({ ...i, category: 'moveout' })),
  ]

  // Sort: overdue first, then by age descending
  return all
    .sort((a, b) => {
      if (a.sla_overdue && !b.sla_overdue) return -1
      if (!a.sla_overdue && b.sla_overdue) return 1
      return b.age_days - a.age_days
    })
    .slice(0, 3)
}

// Main function: generate summary + compute top items
// Called during scan for each cluster
export async function enrichClusterHealthCache(
  clusterId: string
): Promise<void> {
  // Fetch top items from incidents for this cluster
  const { data: incidents } = await supabaseAdmin
    .from('incidents')
    .select('id, title, category, created_at, sender_name, unit_number, sla_overdue, ticket_id')
    .eq('cluster', clusterId)
    .in('status', ['new', 'awaiting_lee', 'acting'])
    .order('created_at', { ascending: true })
    .limit(50)

  if (!incidents?.length) return

  const now = new Date()
  const withAge = incidents.map(i => ({
    ...i,
    age_days: Math.floor(
      (now.getTime() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24)
    ),
    owner_name: i.sender_name ?? 'Unknown',
    unit: i.unit_number ?? '—',
  }))

  const byCategory = (cat: string) =>
    withAge
      .filter(i => i.category === cat)
      .sort((a, b) => {
        // Most overdue first, then most recent last
        if (a.sla_overdue && !b.sla_overdue) return -1
        if (!a.sla_overdue && b.sla_overdue) return 1
        return b.age_days - a.age_days
      })

  const maintenanceItems = byCategory('maintenance')
  const cleaningItems = byCategory('cleaning')
  const moveinItems = byCategory('move_in')
  const moveoutItems = byCategory('move_out')

  // Get cluster name
  const { data: cache } = await supabaseAdmin
    .from('cluster_health_cache')
    .select('cluster_name')
    .eq('cluster', clusterId)
    .single()

  const clusterData: ClusterData = {
    cluster: clusterId,
    cluster_name: cache?.cluster_name ?? clusterId,
    maintenance_items: maintenanceItems,
    cleaning_items: cleaningItems,
    movein_items: moveinItems,
    moveout_items: moveoutItems,
    total_maintenance: maintenanceItems.length,
    total_cleaning: cleaningItems.length,
    total_movein: moveinItems.length,
    total_moveout: moveoutItems.length,
    sla_breaches: withAge.filter(i => i.sla_overdue).length,
  }

  // Generate AI summary
  const aiSummary = await generateClusterAISummary(clusterData)
  const topBlockers = computeTopBlockers(clusterData)

  // Cache everything
  await supabaseAdmin
    .from('cluster_health_cache')
    .update({
      ai_summary: aiSummary,
      ai_summary_generated_at: new Date().toISOString(),
      top_blockers: topBlockers,
      top_maintenance: maintenanceItems.slice(0, 3),
      top_cleaning: cleaningItems.slice(0, 2),
      top_movein: moveinItems.slice(0, 2),
      top_moveout: moveoutItems.slice(0, 2),
    })
    .eq('cluster', clusterId)
}
```

Call `enrichClusterHealthCache(clusterId)` at end of each cluster scan.

---

## The OVR Badge + Age Color System

```typescript
// Consistent across both views

function getAgeColor(ageDays: number): string {
  if (ageDays > 60) return '#E05252'   // red — critical
  if (ageDays > 30) return '#E8A838'   // amber — attention
  return '#4B5A7A'                      // muted — normal
}

function getAgeSuffix(ageDays: number): string {
  return `${ageDays}d`
}

// OVR badge — shows when sla_overdue = true
// <span style="
//   background: #E0525215,
//   border: 1px solid #E05252,
//   color: #E05252,
//   fontSize: 9px,
//   fontFamily: JetBrains Mono,
//   padding: 1px 4px,
//   borderRadius: 3px
// ">OVR</span>

// Row background when age > 90 days:
// background: rgba(224, 82, 82, 0.04)  ← very subtle red tint
```

---

## Page Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ Cluster Health   [11 critical]      [≡ Category] [◈ Command]  [↻]  │  48px header
├─────────────────────────────────────────────────────────────────────┤
│ ● ● ● ● ● ● ● ● ● ● ●                                             │  32px dot nav
│ C1 C2 C3 C4 C5 C6 C7 C8 C9 C10 C11                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  → scroll    │  card wall
│ │   C1     │ │   C2     │ │   C3     │ │   C4     │              │
│ │          │ │          │ │          │ │          │              │
│ │ [cards]  │ │ [cards]  │ │ [cards]  │ │ [cards]  │              │
│ │          │ │          │ │          │ │          │              │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Dot Navigation Strip

```tsx
// components/clusters/ClusterDotNav.tsx

interface DotNavProps {
  clusters: ClusterHealth[]
  activeCluster: string | null
  visibleClusters: string[]   // which clusters are in viewport
  onDotClick: (clusterId: string) => void
}

// Each dot:
//   Size: 10px diameter normally, 13px when visible in viewport
//   Color: RED/#E05252, AMBER/#E8A838, GREEN/#4BF2A2 by health_status
//   Invisible clusters: dimmer opacity (0.5)
//   Active/visible clusters: full opacity + subtle white ring
//   Label: C1-C11 below, 9px JetBrains Mono

// On click: smooth scroll to that cluster card
// scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })

// Intersection Observer tracks which cards are visible
// Updates visibleClusters state
// Dot for visible cards gets the larger size
```

---

## View Toggle

```tsx
// Top right of page header

<div style={{ display: 'flex', gap: 4 }}>
  <ViewToggleButton
    active={view === 'category'}
    icon={<LayoutList size={14} />}
    label="Category"
    onClick={() => setView('category')}
  />
  <ViewToggleButton
    active={view === 'command'}
    icon={<Crosshair size={14} />}
    label="Command"
    onClick={() => setView('command')}
  />
</div>

// Active style:
//   background: #F2784B20
//   border: 1px solid #F2784B50
//   color: #F2784B
//   icon: #F2784B

// Inactive style:
//   background: transparent
//   border: 1px solid #1A2035
//   color: #4B5A7A

// On switch:
//   All 11 cards cross-fade simultaneously
//   250ms ease-out opacity transition
//   View choice saved to sessionStorage key 'nucleus_cluster_view'
```

---

## Card Shared Structure (Both Views)

```tsx
// ClusterCard.tsx — outer shell, same in both views

<div
  ref={cardRef}   // for intersection observer
  id={`cluster-${clusterId}`}  // for dot nav scroll target
  style={{
    width: 'calc((100vw - 56px - 48px) / 4)',
    minWidth: 280,
    maxWidth: 400,
    height: 'calc(100vh - 120px)',
    flexShrink: 0,
    background: '#0D1525',
    border: `1px solid ${severityBorderColor}`,
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transition: 'border-color 0.3s ease',
  }}
>
  {/* HEADER — same in both views */}
  <CardHeader cluster={cluster} health={health} />

  {/* BODY — switches between Category and Command */}
  <div style={{
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  }}>
    <AnimatePresence mode="wait">
      {view === 'category' ? (
        <motion.div
          key="category"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          style={{ height: '100%' }}
        >
          <CategoryView data={data} onMoreClick={openSidePanel} />
        </motion.div>
      ) : (
        <motion.div
          key="command"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          style={{ height: '100%' }}
        >
          <CommandView data={data} onMoreClick={openSidePanel} />
        </motion.div>
      )}
    </AnimatePresence>
  </div>

  {/* FOOTER — same in both views */}
  <CardFooter cluster={cluster} onScanClick={triggerSingleScan} />
</div>
```

### Card Header

```tsx
// Height: 56px
// Always visible, same in both views

<div style={{
  padding: '12px 14px 8px',
  borderBottom: '1px solid #1A2035',
  flexShrink: 0,
}}>
  {/* Row 1: dot + cluster + name + health badge */}
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <div style={{
      width: 8, height: 8,
      borderRadius: '50%',
      background: severityColor,
      boxShadow: `0 0 6px ${severityColor}`,
    }} />
    <span style={{
      fontFamily: 'JetBrains Mono',
      fontSize: 13,
      fontWeight: 600,
      color: severityColor,
    }}>
      {clusterId}
    </span>
    <span style={{
      fontFamily: 'DM Sans',
      fontSize: 12,
      color: '#8A9BB8',
      flex: 1,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }}>
      {clusterName}
    </span>
    <HealthBadge status={healthStatus} />
  </div>
</div>
```

### Card Footer

```tsx
// Height: 36px
// Scan time + action icons

<div style={{
  padding: '6px 14px',
  borderTop: '1px solid #1A2035',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexShrink: 0,
}}>
  <ScanTimeIndicator lastScannedAt={lastComputedAt} />
  <div style={{ display: 'flex', gap: 8 }}>
    <BriefStatusIcon briefSentToday={briefSentToday} />
    <StandupStatusIcon standupReceived={standupReceived} />
    <SingleScanButton clusterId={clusterId} />
  </div>
</div>
```

---

## View B — Category Strips

### Height Budget (calc(100vh - 120px) ≈ 820px)

```
Header:           56px
4 × Category:     4 × 176px = 704px
Footer:           36px
Dividers:         3 × 1px = 3px
─────────────────────────────────
Total:            799px ✓ (21px breathing room)
```

### Per Category Section (176px)

```
Category header:  28px  (icon + name + count + overdue badge)
Divider:           1px
Issue row 1:      42px  (title + age/OVR · owner + unit)
Issue row 2:      42px
Issue row 3:      42px  ← only if height allows
More link:        20px
Bottom padding:    1px
─────────────────────────────────
Total:            176px ✓
```

Each issue row (42px):
```
Line 1 (22px): [title truncated ~45 chars]  [age colored]  [OVR badge if overdue]
Line 2 (16px): [owner name] · [unit/property]
               4px gap between rows
```

### CategorySection Component

```tsx
interface CategorySectionProps {
  icon: string              // '🔧' '🧹' '→' '↺'
  label: string             // 'Maintenance' 'Cleaning' 'Move In' 'Turnaround'
  total: number
  overdue_count: number
  items: TicketSummary[]    // top 2-3 pre-computed items
  all_count: number
  cluster: string
  category: string
  onMoreClick: (cluster: string, category: string) => void
}

// Layout:
// ┌──────────────────────────────────────────────────────┐
// │ 🔧 Maintenance         48  [6 OVR]                  │  ← 28px
// ├──────────────────────────────────────────────────────┤  ← 1px divider
// │ Bed bug infestation Room 1              79d [OVR]   │  ← line 1, 22px
// │ Airen · Rica Residence                              │  ← line 2, 16px
// │                                                      │  ← 4px gap
// │ Access card breach pending owner        62d [OVR]   │
// │ Airen · RICA 22-16                                  │
// │                                                      │
// │ AC broken unit B2-12                    45d          │
// │ Airen · Sentul Block B                              │
// │                                                      │
// │ [+45 more →]                                        │  ← 20px
// └──────────────────────────────────────────────────────┘

// Category header color:
//   If overdue_count > 0: label in amber/red
//   If overdue_count === 0: label in muted
//   Overdue badge: [6 OVR] in red pill

// Issue row background:
//   age > 90 days: rgba(224,82,82,0.04) ← subtle red tint
//   Normal: transparent

// [+N more →] link:
//   color: #F2784B
//   fontSize: 11px
//   cursor: pointer
//   onClick: opens side panel filtered to this category
```

---

## View A+D — Command View

### Height Budget

```
Header:          56px
AI Summary:      84px  (2-3 lines + label)
Divider:          1px
Blockers label:  20px
Blocker 1:       68px
Divider:          1px
Blocker 2:       68px
Divider:          1px
Blocker 3:       68px
Divider:          1px
Category counts: 48px
Footer:          36px
Padding/gaps:    ~20px
────────────────────────
Total:           472px ✓ (well within card height)
Remaining space: used for natural breathing room
```

### CommandView Component

```tsx
// AI Summary section (84px)
<div style={{
  padding: '10px 14px 8px',
  background: '#080E1C',
  margin: '8px',
  borderRadius: 8,
  border: '1px solid #1A2035',
}}>
  <div style={{
    fontFamily: 'JetBrains Mono',
    fontSize: 9,
    color: '#9B6DFF',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  }}>
    ⚡ AI Situation Summary
  </div>
  <div style={{
    fontFamily: 'DM Sans',
    fontSize: 12,
    color: '#C8D0E0',
    lineHeight: 1.6,
  }}>
    {aiSummary ?? 'Generating summary...'}
  </div>
  {aiSummaryGeneratedAt && (
    <div style={{ fontSize: 9, color: '#4B5A7A', marginTop: 4 }}>
      Generated {timeAgo(aiSummaryGeneratedAt)}
      {' · '}
      <span
        style={{ color: '#F2784B', cursor: 'pointer' }}
        onClick={refreshSummary}
      >
        Refresh
      </span>
    </div>
  )}
</div>

// Top Blockers section
<div style={{ padding: '4px 14px' }}>
  <div style={{
    fontFamily: 'JetBrains Mono',
    fontSize: 9,
    color: '#4B5A7A',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  }}>
    Top Blockers
  </div>

  {topBlockers.map((blocker, i) => (
    <BlockerRow key={blocker.id} blocker={blocker} index={i} />
  ))}
</div>

// Category counts row
<div style={{
  padding: '10px 14px',
  borderTop: '1px solid #1A2035',
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
}}>
  <CountPill icon="🔧" count={maintenanceTotal} overdue={maintenanceOverdue} />
  <CountPill icon="🧹" count={cleaningTotal} overdue={cleaningOverdue} />
  <CountPill icon="→" count={moveinTotal} overdue={moveinOverdue} />
  <CountPill icon="↺" count={moveoutTotal} overdue={moveoutOverdue} />
  <span
    style={{ color: '#F2784B', fontSize: 11, cursor: 'pointer', marginLeft: 'auto' }}
    onClick={() => openSidePanel(cluster, 'all')}
  >
    View all →
  </span>
</div>
```

### BlockerRow Component (68px)

```tsx
// Each blocker row in Command view

<div style={{
  padding: '8px 0',
  borderBottom: i < 2 ? '1px solid #1A2035' : 'none',
  background: blocker.age_days > 90 ? 'rgba(224,82,82,0.04)' : 'transparent',
}}>
  {/* Line 1: category icon + title + age */}
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  }}>
    <span style={{ fontSize: 12 }}>{categoryIcon(blocker.category)}</span>
    <span style={{
      flex: 1,
      fontSize: 12,
      fontFamily: 'DM Sans',
      color: '#E8EEF8',
      fontWeight: 500,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }}>
      {blocker.title}
    </span>
    <span style={{
      fontFamily: 'JetBrains Mono',
      fontSize: 10,
      color: getAgeColor(blocker.age_days),
      flexShrink: 0,
    }}>
      {blocker.age_days}d
    </span>
    {blocker.sla_overdue && <OVRBadge />}
  </div>

  {/* Line 2: owner + unit */}
  <div style={{
    fontSize: 11,
    color: '#8A9BB8',
    fontFamily: 'DM Sans',
    paddingLeft: 18,  // indent under category icon
  }}>
    {blocker.owner_name}
    {blocker.unit && ` · ${blocker.unit}`}
  </div>
</div>
```

---

## Horizontal Scroll Container

```tsx
// components/clusters/ClusterWall.tsx

<div
  ref={scrollContainerRef}
  style={{
    display: 'flex',
    gap: 12,
    padding: '0 16px 16px',
    overflowX: 'auto',
    overflowY: 'hidden',
    height: 'calc(100vh - 120px)',
    // Hide scrollbar visually but keep functional
    scrollbarWidth: 'none',       // Firefox
    msOverflowStyle: 'none',      // IE/Edge
    WebkitOverflowScrolling: 'touch',  // iOS momentum
    // Gentle proximity snap
    scrollSnapType: 'x proximity',
  }}
>
  {clusters.map(cluster => (
    <div
      key={cluster.cluster}
      style={{ scrollSnapAlign: 'start', flexShrink: 0 }}
    >
      <ClusterCard
        cluster={cluster}
        view={view}
        onMoreClick={openSidePanel}
      />
    </div>
  ))}
</div>

// Hide scrollbar in webkit browsers
// Add to global CSS:
// .cluster-wall::-webkit-scrollbar { display: none; }
```

### Intersection Observer for Dot Nav

```typescript
// Track which cluster cards are visible in viewport

useEffect(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        const clusterId = entry.target.getAttribute('data-cluster')
        if (!clusterId) return
        if (entry.isIntersecting) {
          setVisibleClusters(prev => [...new Set([...prev, clusterId])])
        } else {
          setVisibleClusters(prev => prev.filter(c => c !== clusterId))
        }
      })
    },
    {
      root: scrollContainerRef.current,
      threshold: 0.3,  // 30% visible = counts as visible
    }
  )

  cardRefs.current.forEach(ref => {
    if (ref) observer.observe(ref)
  })

  return () => observer.disconnect()
}, [])

// Dot click → scroll to cluster
function scrollToCluster(clusterId: string) {
  const card = document.getElementById(`cluster-${clusterId}`)
  if (!card) return
  card.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
    inline: 'start',
  })
}
```

---

## API Route Updates

### GET /api/clusters

Update to include new cached fields:

```typescript
// Return from cluster_health_cache:
{
  cluster,
  cluster_name,
  health_status,
  health_score,
  maintenance_total,
  maintenance_overdue,
  cleaning_total,
  cleaning_overdue,
  movein_total,
  movein_overdue,
  moveout_total,
  moveout_overdue,
  // NEW:
  ai_summary,
  ai_summary_generated_at,
  top_blockers,          // [{id, title, category, age_days, owner_name, unit, sla_overdue}]
  top_maintenance,       // [{id, ticket_id, title, age_days, owner_name, unit, sla_overdue}]
  top_cleaning,
  top_movein,
  top_moveout,
  last_computed_at,
  standup_report_at,
  brief_sent_today,
}
```

### POST /api/clusters/[id]/refresh-summary

```
Trigger AI summary regeneration for a single cluster.
Calls enrichClusterHealthCache(clusterId).
Returns: { ai_summary, generated_at }
Protected by x-nucleus-secret.
```

---

## Files to Create

```
components/clusters/ClusterWall.tsx          ← scroll container
components/clusters/ClusterDotNav.tsx        ← dot navigation strip
components/clusters/ClusterCard.tsx          ← card shell (shared)
components/clusters/CardHeader.tsx           ← cluster header
components/clusters/CardFooter.tsx           ← scan time + icons
components/clusters/CategoryView.tsx         ← View B content
components/clusters/CategorySection.tsx      ← single category strip
components/clusters/IssueRow.tsx             ← single issue line
components/clusters/CommandView.tsx          ← View A+D content
components/clusters/BlockerRow.tsx           ← single blocker line
components/clusters/AISummaryPanel.tsx       ← AI summary + refresh
components/clusters/CountPill.tsx            ← category count pill
components/clusters/OVRBadge.tsx             ← overdue badge
components/clusters/ViewToggle.tsx           ← Category/Command toggle

lib/clusters/generate-cluster-summary.ts     ← AI generation
lib/clusters/compute-top-items.ts            ← top items computation

app/api/clusters/[id]/refresh-summary/route.ts  ← POST refresh AI
```

## Files to Update

```
app/(dashboard)/clusters/page.tsx            ← use new components
components/clusters/ClusterDetailPanel.tsx   ← existing side panel (enhance)
lib/clusters/compute-health.ts               ← call enrichClusterHealthCache
app/api/clusters/route.ts                    ← return new fields
```

---

## Testing Plan

### Step 1 — Migration
```
supabase db push
Verify: new columns exist on cluster_health_cache
  ai_summary, top_blockers, top_maintenance, top_cleaning,
  top_movein, top_moveout, ai_summary_generated_at
```

### Step 2 — AI Summary generation
```
curl -X POST http://localhost:3000/api/clusters/C11/refresh-summary \
  -H "x-nucleus-secret: belive_nucleus_2026"

Verify: ai_summary populated in cluster_health_cache for C11
Verify: summary is 2-3 sentences, mentions specific staff + unit
Verify: not generic (no "there are X tickets")
```

### Step 3 — Card width
```
Open localhost:3000/clusters
Verify: exactly 4 cards visible at 1440px screen width
Verify: cards fill the viewport width naturally
Verify: no horizontal scrollbar visible (hidden via CSS)
Verify: can still scroll horizontally with trackpad/mouse
```

### Step 4 — Dot navigation
```
Verify: 11 dots visible above cards
Verify: dots colored by cluster health_status
Verify: visible clusters have larger/brighter dots
Scroll right → dots update to show new visible clusters
Tap C11 dot → smooth scroll to C11 card
```

### Step 5 — Category view (View B)
```
Default view should be Category
Verify: 4 sections per card (Maintenance, Cleaning, Move In, Turnaround)
Verify: each section shows top 2-3 issues with title + age + owner
Verify: [OVR] badge appears on overdue items
Verify: age color: muted < 30d, amber 30-60d, red > 60d
Verify: [+N more →] shows correct remaining count
Verify: clicking [+N more →] opens side panel for that category
```

### Step 6 — Command view (View A+D)
```
Click [◈ Command] toggle
Verify: all 11 cards cross-fade simultaneously (250ms)
Verify: AI summary appears at top of each card
Verify: top 3 blockers shown with category icon + title + age + owner
Verify: category counts row at bottom
Verify: [View all →] opens side panel
```

### Step 7 — View toggle persistence
```
Switch to Command view
Navigate away to /command
Come back to /clusters
Verify: Command view still active (sessionStorage)
Refresh page
Verify: resets to Category view (default)
```

### Step 8 — Category alignment
```
In Category view, verify that:
  Maintenance section top edge is at exact same Y position on all cards
  Cleaning section top edge is aligned across all cards
  Move In section aligned
  Turnaround section aligned
This is critical for horizontal scanning to work
```

### Step 9 — Refresh AI summary
```
In Command view, find the "Refresh" link in AI summary
Click it
Verify: spinner appears
Verify: new summary loads after ~5 seconds
Verify: "Generated X seconds ago" timestamp updates
```

### Step 10 — Single cluster scan
```
Click ↻ icon on C11 footer
Verify: loading spinner on that card
Verify: data refreshes for C11 only
Verify: AI summary regenerates for C11
```

### Step 11 — Side panel still works
```
Click [+45 more →] in Category view
Verify: existing side panel opens with full list for that cluster+category
Verify: side panel shows correct category filter
Close side panel → wall still visible
```

### Step 12 — Realtime updates
```
Keep /clusters open
Trigger a scan via API
Verify: cards update without page refresh
Verify: dot colors update if health changes
Verify: top items update in cards
```

---

## Done Criteria

- [ ] ai_summary + top_* columns added to cluster_health_cache
- [ ] enrichClusterHealthCache() generates AI summary during scan
- [ ] AI summary is 2-3 sentences, specific, not generic
- [ ] top_blockers computed correctly (overdue first, then by age)
- [ ] top_maintenance/cleaning/movein/moveout computed correctly
- [ ] Card width = naturally 4 visible at 1440px
- [ ] Horizontal scroll works smoothly (trackpad + mouse wheel)
- [ ] No visible scrollbar (hidden via CSS)
- [ ] 11 dot navigation strip above cards
- [ ] Dots colored by cluster health status
- [ ] Visible clusters have larger/brighter dots
- [ ] Tap dot → smooth scroll to that cluster
- [ ] [≡ Category] [◈ Command] toggle visible top right
- [ ] Category view is default
- [ ] Category view: 4 sections per card with fixed heights
- [ ] All category sections aligned across all 11 cards
- [ ] Issue rows show: title + age (colored) + OVR badge + owner + unit
- [ ] [+N more →] shows correct count and opens side panel
- [ ] Command view: AI summary + top 3 blockers + category counts
- [ ] View switch: all 11 cards cross-fade simultaneously (250ms)
- [ ] View persists in sessionStorage during session
- [ ] Resets to Category on page load
- [ ] OVR badge appears on all overdue items
- [ ] Age colors: muted/amber/red at correct thresholds
- [ ] Row background subtle red when age > 90 days
- [ ] Refresh button regenerates AI summary for single cluster
- [ ] Single cluster scan button in card footer
- [ ] Realtime: cards update without refresh after scan
- [ ] Existing side panel still works correctly
- [ ] Zero TypeScript errors
- [ ] Deployed to production
