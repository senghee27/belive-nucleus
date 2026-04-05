import { NextRequest, NextResponse } from 'next/server'
import { getOpenIssues, getIssueStats, createIssue } from '@/lib/issues'

export async function GET(req: NextRequest) {
  try {
    const clusters = req.nextUrl.searchParams.get('clusters')?.split(',').filter(Boolean)
    const issues = await getOpenIssues(clusters)
    const stats = await getIssueStats()
    return NextResponse.json({ ok: true, issues, stats })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const issue = await createIssue(body)
    if (!issue) return NextResponse.json({ error: 'Failed to create issue' }, { status: 500 })
    return NextResponse.json({ ok: true, issue })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
