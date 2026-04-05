import { getOpenIssues } from '@/lib/issues'
import { sendLarkMessage } from '@/lib/lark'
import type { Issue } from '@/lib/issues'

export async function sendIssuesSummaryToLee(): Promise<boolean> {
  try {
    const issues = await getOpenIssues(['C1', 'C2', 'C11'])
    if (issues.length === 0) return true

    const red = issues.filter(i => i.severity === 'RED')
    const yellow = issues.filter(i => i.severity === 'YELLOW')
    const overdue = issues.filter(i => i.escalation_due_at && new Date(i.escalation_due_at).getTime() < Date.now())

    const lines: string[] = []
    lines.push(`🔴 Issues Summary — ${new Date().toLocaleDateString('en-MY')}\n`)

    if (red.length > 0) {
      lines.push(`RED (${red.length}):`)
      for (const i of red.slice(0, 5)) {
        lines.push(`- ${i.cluster} ${i.title} — ${i.days_open}d — ${i.owner_name ?? 'Unassigned'}`)
      }
      lines.push('')
    }

    if (yellow.length > 0) {
      lines.push(`YELLOW (${yellow.length}):`)
      for (const i of yellow.slice(0, 5)) {
        lines.push(`- ${i.cluster} ${i.title} — ${i.days_open}d`)
      }
      lines.push('')
    }

    if (overdue.length > 0) {
      lines.push(`⚠️ Overdue (${overdue.length} past escalation time):`)
      for (const i of overdue.slice(0, 3)) {
        lines.push(`- ${i.cluster} ${i.title}`)
      }
      lines.push('')
    }

    lines.push('View all: https://belive-nucleus.vercel.app/issues')

    const leeId = process.env.LEE_LARK_CHAT_ID
    if (!leeId) return false

    return await sendLarkMessage(leeId, lines.join('\n'), 'open_id')
  } catch (error) {
    console.error('[issueDM:summary]', error instanceof Error ? error.message : 'Unknown')
    return false
  }
}

export async function sendP1AlertToLee(issue: Issue): Promise<boolean> {
  try {
    const leeId = process.env.LEE_LARK_CHAT_ID
    if (!leeId) return false

    const msg = [
      `🚨 P1 DETECTED — ${issue.cluster}`,
      issue.title,
      `Owner: ${issue.owner_name ?? 'Unassigned'}`,
      `Escalation in: 2 hours`,
      '',
      'View: https://belive-nucleus.vercel.app/issues',
    ].join('\n')

    return await sendLarkMessage(leeId, msg, 'open_id')
  } catch (error) {
    console.error('[issueDM:p1]', error instanceof Error ? error.message : 'Unknown')
    return false
  }
}
