import { NextRequest, NextResponse } from 'next/server'
import { getActiveGroups } from '@/lib/monitored-groups'
import { scanGroup } from '@/lib/scanner'
import { computeClusterHealth } from '@/lib/cluster-health'

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-nucleus-secret')
    if (secret !== process.env.NUCLEUS_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const cluster = req.nextUrl.searchParams.get('cluster')

    if (cluster) {
      // Single cluster scan + compute
      const groups = await getActiveGroups()
      const clusterGroups = groups.filter(g => g.cluster === cluster)

      if (clusterGroups.length === 0) {
        return NextResponse.json({ error: `No monitored groups for ${cluster}` }, { status: 404 })
      }

      const results = []
      for (const group of clusterGroups) {
        results.push(await scanGroup(group))
      }
      await computeClusterHealth(cluster)

      return NextResponse.json({
        ok: true,
        cluster,
        groups_scanned: results.length,
        total_messages: results.reduce((s, r) => s + r.messages, 0),
        total_incidents: results.reduce((s, r) => s + r.new_incidents, 0),
        results,
      })
    }

    // All clusters — sequential with per-cluster results
    const groups = await getActiveGroups()
    const clusterMap = new Map<string, typeof groups>()
    for (const g of groups) {
      const list = clusterMap.get(g.cluster) ?? []
      list.push(g)
      clusterMap.set(g.cluster, list)
    }

    const allResults = []
    for (const [c, cGroups] of clusterMap) {
      for (const group of cGroups) {
        allResults.push(await scanGroup(group))
      }
      await computeClusterHealth(c)
    }

    return NextResponse.json({
      ok: true,
      clusters_scanned: clusterMap.size,
      groups_scanned: allResults.length,
      total_messages: allResults.reduce((s, r) => s + r.messages, 0),
      total_incidents: allResults.reduce((s, r) => s + r.new_incidents, 0),
      results: allResults,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
