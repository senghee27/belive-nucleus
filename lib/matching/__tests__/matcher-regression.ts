/**
 * REGRESSION LOCK — Matcher bad-thread-merge bug
 *
 * This is the regression test for the bug that motivated the entire
 * Reasoning Trace + Backend Upgrade feature. It uses a stubbed
 * supabaseAdmin so it runs fully in-process (no DB, no network) — the
 * goal is to exercise the *deterministic matching logic*, not the DB.
 *
 * Scenario: an open "Owner chasing 50% occupancy" incident exists in C10
 * with thread_keywords ['b-15-06', 'occupancy', 'owner', 'chasing']. A new
 * Lark message arrives in the same cluster containing a maintenance list
 * that mentions "B-15-06" in passing alongside three other unrelated units
 * and several maintenance keywords (aircon, plumbing, lock). Keyword
 * overlap with the target is below 40%.
 *
 * Expected: decision === 'new', signal === 'unit_cluster', confidence ~55,
 * reasoning mentions "below 40% threshold" or "conservatism rule".
 *
 * Run: `npx tsx lib/matching/__tests__/matcher-regression.ts`
 */

import Module from 'module'

// ---------------------------------------------------------------------------
// Stub supabaseAdmin BEFORE the matcher imports it.
//
// The matcher makes three different shapes of query:
//
//   (1) Signal 1 — lark_root_id exact match:
//       .from('incidents').select('id').eq('lark_root_id', ...)
//                         .in(...).limit(1).maybeSingle()
//
//   (2) Signal 2 — ticket_id match (only runs if a BLV-XX-XXXXXX token
//       appears in raw_content; skipped here):
//       .from('incidents').select('id').contains('thread_keywords', [...])
//                         .in(...).limit(1).maybeSingle()
//
//   (3) Signal 3 — unit + cluster candidate list:
//       .from('incidents').select('id, thread_keywords, created_at')
//                         .eq('cluster', ...).contains('thread_keywords', [...])
//                         .in(...).gte('created_at', ...)
//                         .order('created_at', { ascending: false })
//
// The stub routes by the terminal method: maybeSingle() → single-row
// (always empty here so signals 1 + 2 fall through); order() → candidate
// list (returns the seeded target so signal 3 evaluates overlap).
// ---------------------------------------------------------------------------

const seededTarget = {
  id: 'incident-owner-chasing-1',
  thread_keywords: ['b-15-06', 'occupancy', 'owner', 'chasing'],
  created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
}

type ThenableChain = Record<string, (...args: unknown[]) => unknown>

function makeChain(): ThenableChain {
  const chain: ThenableChain = {}
  const singleResult = Promise.resolve({ data: null, error: null })
  const listResult = Promise.resolve({ data: [seededTarget], error: null })

  chain.select = () => chain
  chain.eq = () => chain
  chain.in = () => chain
  chain.limit = () => chain
  chain.contains = () => chain
  chain.gte = () => chain
  chain.lt = () => chain
  chain.not = () => chain
  chain.maybeSingle = () => singleResult
  chain.single = () => singleResult
  chain.order = () => listResult
  return chain
}

const stubSupabase = {
  from(_table: string) {
    return makeChain()
  },
}

const moduleInternals = Module as unknown as {
  _load: (req: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = moduleInternals._load
moduleInternals._load = function (request, parent, isMain) {
  if (request.endsWith('/supabase-admin') || request === '@/lib/supabase-admin') {
    return { supabaseAdmin: stubSupabase }
  }
  return originalLoad.call(this, request, parent, isMain)
}

// ---------------------------------------------------------------------------
// Now import the matcher and run the regression scenario.
// ---------------------------------------------------------------------------

async function run() {
  const { findMatchingIncident } = await import('../incident-matcher')

  const result = await findMatchingIncident({
    cluster: 'C10',
    lark_root_id: 'DIFFERENT-thread-456',
    // B-15-06 is the *first* unit so the matcher's `kws.find(...)` picks it,
    // exactly mirroring the real bug: a maintenance list that mentions the
    // unit in passing alongside unrelated maintenance noise.
    raw_content:
      'Maintenance list update: B-15-06 mentioned in passing, A-12-03 aircon done, C-07-11 plumbing pending, D-22-05 lock replaced',
    sender_open_id: 'test-sender',
  })

  const failures: string[] = []
  if (result.decision !== 'new') failures.push(`decision must be 'new', got '${result.decision}'`)
  if (result.signal !== 'unit_cluster') failures.push(`signal must be 'unit_cluster', got '${result.signal}'`)
  if (result.confidence >= 70) failures.push(`confidence must be < 70, got ${result.confidence}`)
  if (!/40%|threshold|conservatism/i.test(result.reasoning)) {
    failures.push(`reasoning must mention "40%", "threshold", or "conservatism"; got: ${result.reasoning}`)
  }

  if (failures.length > 0) {
    console.error('❌ MATCHER REGRESSION LOCK FAILED')
    for (const f of failures) console.error('  -', f)
    console.error('\nResult was:', JSON.stringify(result, null, 2))
    process.exit(1)
  }

  console.log('✅ MATCHER REGRESSION LOCK PASSED')
  console.log(JSON.stringify(result, null, 2))
}

run().catch(err => {
  console.error('❌ regression test threw:', err)
  process.exit(1)
})
