/**
 * situation-lines.ts — One-shot backfill for ai_report_tickets.ai_situation_line.
 *
 * The migration adds the column but doesn't populate it — generating
 * situation lines for every existing ticket is a Claude call per row,
 * which is an app-level concern. This script walks every open ticket
 * missing ai_situation_line and fills it in, rate-limited by a small
 * concurrency pool so we don't pound the Anthropic API.
 *
 * Usage (from belive-nucleus/):
 *   # Against production:
 *   vercel env pull .env.backfill.local
 *   npx tsx scripts/backfill/situation-lines.ts --env .env.backfill.local
 *
 * Flags:
 *   --env <path>      env file with ANTHROPIC_API_KEY + Supabase creds
 *   --limit <n>       cap number of tickets processed (default: all)
 *   --dry-run         show what would be generated, don't write
 *
 * Idempotent: only processes rows where ai_situation_line IS NULL,
 * so safe to re-run after an interrupted batch.
 */

import './_env-preload'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateSituationLine, type SituationLineInput } from '@/lib/tickets/situation-line'

const CONCURRENCY = 4 // Anthropic-friendly default; adjust if you hit rate limits

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const limitIdx = process.argv.indexOf('--limit')
  const limit = limitIdx >= 0 && limitIdx + 1 < process.argv.length
    ? parseInt(process.argv[limitIdx + 1], 10)
    : 10_000

  console.log(`\n🧹 Backfilling ai_situation_line${dryRun ? ' (dry run)' : ''}`)
  console.log(`   Concurrency: ${CONCURRENCY}  ·  Limit: ${limit}\n`)

  const { data: rows, error } = await supabaseAdmin
    .from('ai_report_tickets')
    .select('id, ticket_id, issue_description, summary, unit_number, property, owner_name, owner_role, status, age_days')
    .eq('status', 'open')
    .is('ai_situation_line', null)
    .limit(limit)

  if (error) {
    console.error('❌ select failed:', error.message)
    process.exit(1)
  }

  const list = rows ?? []
  if (list.length === 0) {
    console.log('✅ Nothing to backfill — every open ticket already has a situation line.')
    return
  }

  console.log(`📝 ${list.length} ticket(s) need a situation line\n`)

  let done = 0
  let generated = 0
  let fallback = 0
  let failed = 0
  const errors: string[] = []

  // Tiny concurrency pool — process CONCURRENCY at a time without
  // pulling in an async-pool dependency.
  const queue = [...list]
  async function worker() {
    while (queue.length > 0) {
      const row = queue.shift()
      if (!row) break
      const input: SituationLineInput = {
        issue_description: row.issue_description as string,
        summary: (row.summary as string | null) ?? null,
        unit_number: (row.unit_number as string | null) ?? null,
        property: (row.property as string | null) ?? null,
        owner_name: (row.owner_name as string | null) ?? null,
        owner_role: (row.owner_role as string | null) ?? null,
        status: (row.status as string | null) ?? 'open',
        age_days: (row.age_days as number | null) ?? null,
      }
      try {
        const result = await generateSituationLine(input)
        if (result.used_fallback) fallback++
        else generated++

        if (!dryRun) {
          const { error: updateErr } = await supabaseAdmin
            .from('ai_report_tickets')
            .update({
              ai_situation_line: result.line,
              ai_situation_generated_at: new Date().toISOString(),
            })
            .eq('id', row.id)
          if (updateErr) {
            failed++
            errors.push(`${row.ticket_id}: ${updateErr.message}`)
          }
        }

        done++
        if (done % 10 === 0 || done === list.length) {
          console.log(`  ${done}/${list.length} processed (gen: ${generated}, fallback: ${fallback}, failed: ${failed})`)
        }
        if (done <= 5) {
          console.log(`    ${row.ticket_id} → ${result.line}`)
        }
      } catch (err) {
        failed++
        errors.push(`${row.ticket_id}: ${err instanceof Error ? err.message : 'Unknown'}`)
        done++
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

  console.log(`\n✅ Done`)
  console.log(`   Generated (LLM): ${generated}`)
  console.log(`   Fallback:        ${fallback}`)
  console.log(`   Failed:          ${failed}`)
  if (errors.length > 0) {
    console.log(`\n   First few errors:`)
    for (const e of errors.slice(0, 5)) console.log(`     ${e}`)
  }
}

main().catch(err => {
  console.error('\n💥 Backfill crashed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
