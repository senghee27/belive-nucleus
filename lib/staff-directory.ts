import { supabaseAdmin } from './supabase-admin'
import { getLarkToken } from './lark'

const LARK_API = 'https://open.larksuite.com'

export type StaffMember = {
  open_id: string
  name: string
  first_name: string
  role: string | null
  cluster: string | null
  avatar_url: string | null
  department: string | null
}

// In-memory cache for fast lookups during request
const staffCache = new Map<string, StaffMember>()

const ROLE_COLORS: Record<string, string> = {
  IOE: '#9B6DFF', OOE: '#4BB8F2', Tech: '#4BF2A2',
  OM: '#F2784B', ED: '#F2784B', CEO: '#F2784B',
  CFO: '#4BB8F2', CBO: '#E8A838', Sales: '#E8A838',
  Finance: '#6DD5F2',
}

export function getInitialsColor(role: string | null): string {
  return ROLE_COLORS[role ?? ''] ?? '#4B5A7A'
}

export function getInitials(name: string | null): string {
  if (!name) return '?'
  const parts = name.split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// ---------------------------------------------------------------------------
// Owner name resolution — single source of truth for the "— owner" trailing
// label across the app (war-room rows, mobile queue, command center, etc.).
//
// The historical bug: when Lark webhook staff resolution fails, the
// fallback was `staff?.name ?? senderOpenId`, which writes raw open_ids
// (cli_xxxxxxxxxxxxxxxxx, ou_abcdef123456) into incidents.sender_name.
// Those then leak into every UI surface that reads sender_name.
//
// Fix: all owner rendering goes through sanitizeOwnerLabel (sync, client-
// safe) or resolveOwnerName (async, server-side staff cache lookup).
// Neither ever returns a raw open_id — failure mode is always "— unknown".
// ---------------------------------------------------------------------------

const OPEN_ID_PATTERN = /^(cli_|ou_|om_|oc_|on_)[A-Fa-f0-9]{6,}$/

/**
 * Pure check — does the string look like a Lark open_id rather than a
 * human name? Used to defend UI components from polluted sender_name
 * values in the DB.
 */
export function isRawOpenId(s: string | null | undefined): boolean {
  if (!s) return false
  return OPEN_ID_PATTERN.test(s.trim())
}

/**
 * Synchronous owner-label fallback. Safe to call from client components
 * — no DB lookups. Returns a clean first name if the input is a real
 * name, "— unknown" if the input is null, empty, or a raw open_id.
 *
 * Use this as the LAST line of defense in any UI that renders
 * sender_name or sender_open_id as a display label.
 */
export function sanitizeOwnerLabel(raw: string | null | undefined): string {
  if (!raw) return '— unknown'
  const trimmed = raw.trim()
  if (!trimmed) return '— unknown'
  if (isRawOpenId(trimmed)) return '— unknown'
  // First word only — "Mohd Nor Safie" → "Mohd"
  const first = trimmed.split(/\s+/)[0]
  return first || '— unknown'
}

/**
 * Server-side owner resolution. Tries the staff-directory cache + DB,
 * falls back to sanitizing whatever sender_name was persisted. Never
 * returns a raw open_id.
 *
 * Priority order:
 *   1. assigned_to (structured routing PIC name, already clean)
 *   2. staff_directory.first_name by open_id lookup
 *   3. sanitizeOwnerLabel(sender_name) — strips raw open_ids
 *   4. "— unknown"
 *
 * Pass an optional `staffIndex` when bulk-resolving many rows in one
 * request (e.g. the war-room API). That avoids N parallel DB calls.
 */
export async function resolveOwnerName(input: {
  openId?: string | null
  senderName?: string | null
  assignedTo?: string | null
  staffIndex?: Map<string, StaffMember>
}): Promise<string> {
  // 1. Structured routing PIC — always clean, never a raw open_id
  if (input.assignedTo && !isRawOpenId(input.assignedTo)) {
    return input.assignedTo
  }

  // 2. Staff directory lookup
  if (input.openId) {
    const cached = input.staffIndex?.get(input.openId) ?? staffCache.get(input.openId)
    if (cached) {
      return cached.first_name || sanitizeOwnerLabel(cached.name)
    }
    // Fall through to async lookup only when no index was provided;
    // bulk callers should pre-load staffIndex to avoid this path.
    if (!input.staffIndex) {
      const member = await resolveOpenId(input.openId)
      if (member) {
        return member.first_name || sanitizeOwnerLabel(member.name)
      }
    }
  }

  // 3. Whatever sender_name happens to contain — sanitized
  return sanitizeOwnerLabel(input.senderName)
}

export async function resolveOpenId(openId: string): Promise<StaffMember | null> {
  if (!openId) return null

  // Check memory cache
  if (staffCache.has(openId)) return staffCache.get(openId)!

  // Check DB
  const { data } = await supabaseAdmin
    .from('staff_directory')
    .select('open_id, name, first_name, role, cluster, avatar_url, department')
    .eq('open_id', openId)
    .single()

  if (data) {
    const member = data as StaffMember
    staffCache.set(openId, member)
    return member
  }

  // Fetch from Lark API as fallback
  try {
    const token = await getLarkToken()
    const res = await fetch(`${LARK_API}/open-apis/contact/v3/users/${openId}?user_id_type=open_id`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const d = await res.json()
    const user = d.data?.user
    if (user) {
      const member: StaffMember = {
        open_id: openId,
        name: user.name ?? openId,
        first_name: (user.name ?? '').split(' ')[0],
        role: null,
        cluster: null,
        avatar_url: user.avatar?.avatar_240 ?? null,
        department: null,
      }

      // Save to DB for future lookups
      await supabaseAdmin.from('staff_directory').upsert({
        open_id: openId,
        name: member.name,
        first_name: member.first_name,
        avatar_url: member.avatar_url,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'open_id' })

      staffCache.set(openId, member)
      return member
    }
  } catch (error) {
    console.error('[staff:resolve]', error instanceof Error ? error.message : 'Unknown')
  }

  return null
}

export async function resolveAllMentions(content: string): Promise<string> {
  // Parse Lark @mention tags: @_user_1, @_user_2 or <at user_id="ou_xxx">name</at>
  let resolved = content

  // Handle <at> tags
  const atRegex = /<at user_id="([^"]+)">([^<]*)<\/at>/g
  let match
  while ((match = atRegex.exec(content)) !== null) {
    const openId = match[1]
    const staff = await resolveOpenId(openId)
    if (staff) {
      resolved = resolved.replace(match[0], `@${staff.first_name}`)
    }
  }

  // Handle @_user_N placeholders
  const placeholderRegex = /@_user_\d+/g
  resolved = resolved.replace(placeholderRegex, '@team')

  return resolved
}

export async function buildMentionTag(openId: string): Promise<string> {
  const staff = await resolveOpenId(openId)
  const name = staff?.first_name ?? staff?.name ?? 'User'
  return `<at user_id="${openId}">${name}</at>`
}

export async function detectMentionsInText(text: string): Promise<{ name: string; openId: string }[]> {
  // Load staff directory
  const { data: allStaff } = await supabaseAdmin
    .from('staff_directory')
    .select('open_id, name, first_name')
    .eq('is_active', true)

  const mentions: { name: string; openId: string }[] = []
  const lower = text.toLowerCase()

  for (const staff of allStaff ?? []) {
    const firstName = (staff.first_name ?? staff.name.split(' ')[0]).toLowerCase()
    if (firstName.length >= 3 && lower.includes(firstName)) {
      mentions.push({ name: staff.name, openId: staff.open_id })
    }
  }

  return mentions
}

/**
 * Sync staff by reading members of all monitored groups using Lee's user token.
 * This catches users that the bot's contact:user.base:readonly scope cannot see
 * (e.g. external users, privacy-restricted users) but who are active in cluster groups.
 *
 * The bot's tenant token can't read arbitrary users (code 41050), but Lee's user
 * token can read any group he's in. This is the primary sync strategy.
 */
export async function syncStaffFromGroups(): Promise<{ synced: number; groups: number; errors: number }> {
  try {
    // Get Lee's user token
    const { getLeeUserToken } = await import('./lark-tokens')
    let userToken: string
    try {
      userToken = await getLeeUserToken()
    } catch {
      console.error('[staff:syncFromGroups]', 'No active Lee user token — skipping group sync')
      return { synced: 0, groups: 0, errors: 1 }
    }

    // Get all monitored groups
    const { data: groups } = await supabaseAdmin
      .from('monitored_groups')
      .select('chat_id, group_name')
      .eq('scanning_enabled', true)

    if (!groups || groups.length === 0) return { synced: 0, groups: 0, errors: 0 }

    const allMembers = new Map<string, string>()
    let errorCount = 0

    for (const g of groups) {
      let pageToken = ''
      do {
        const url = `${LARK_API}/open-apis/im/v1/chats/${g.chat_id}/members?member_id_type=open_id&page_size=100${pageToken ? `&page_token=${pageToken}` : ''}`
        try {
          const res = await fetch(url, { headers: { Authorization: `Bearer ${userToken}` } })
          const data = await res.json()
          if (data.code !== 0) {
            console.error(`[staff:syncFromGroups:${g.group_name}]`, `${data.code} ${data.msg}`)
            errorCount++
            break
          }
          for (const m of data.data?.items ?? []) {
            if (m.member_id && m.name) allMembers.set(m.member_id, m.name)
          }
          pageToken = data.data?.page_token ?? ''
          if (!data.data?.has_more) pageToken = ''
        } catch (error) {
          console.error(`[staff:syncFromGroups:${g.group_name}]`, error instanceof Error ? error.message : 'Unknown')
          errorCount++
          break
        }
      } while (pageToken)
    }

    // Upsert all collected members
    let synced = 0
    const now = new Date().toISOString()
    for (const [openId, name] of allMembers) {
      const firstName = name.split(' ')[0]
      const { error } = await supabaseAdmin.from('staff_directory').upsert({
        open_id: openId,
        name,
        first_name: firstName,
        last_synced_at: now,
        is_active: true,
      }, { onConflict: 'open_id' })
      if (!error) synced++
    }

    // Invalidate in-memory cache so webhook handler picks up new entries
    staffCache.clear()

    console.log('[staff:syncFromGroups]', `Synced ${synced} members from ${groups.length} groups (${errorCount} errors)`)
    return { synced, groups: groups.length, errors: errorCount }
  } catch (error) {
    console.error('[staff:syncFromGroups]', error instanceof Error ? error.message : 'Unknown')
    return { synced: 0, groups: 0, errors: 1 }
  }
}

export async function syncStaffFromLark(): Promise<{ synced: number }> {
  try {
    const token = await getLarkToken()
    let pageToken = ''
    let synced = 0

    do {
      const url = `${LARK_API}/open-apis/contact/v3/users?page_size=50&department_id=0${pageToken ? `&page_token=${pageToken}` : ''}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()

      if (data.code !== 0) {
        console.error('[staff:sync]', data.msg)
        break
      }

      for (const user of data.data?.items ?? []) {
        await supabaseAdmin.from('staff_directory').upsert({
          open_id: user.open_id,
          lark_user_id: user.user_id,
          name: user.name ?? 'Unknown',
          first_name: (user.name ?? '').split(' ')[0],
          email: user.email,
          phone: user.mobile,
          avatar_url: user.avatar?.avatar_240,
          department: user.department_ids?.[0],
          is_active: user.status?.is_activated ?? true,
          last_synced_at: new Date().toISOString(),
        }, { onConflict: 'open_id' })
        synced++
      }

      pageToken = data.data?.page_token ?? ''
    } while (pageToken)

    console.log(`[staff:sync]`, `Synced ${synced} staff members`)
    return { synced }
  } catch (error) {
    console.error('[staff:sync]', error instanceof Error ? error.message : 'Unknown')
    return { synced: 0 }
  }
}

export async function getAllStaff(): Promise<StaffMember[]> {
  const { data } = await supabaseAdmin
    .from('staff_directory')
    .select('open_id, name, first_name, role, cluster, avatar_url, department')
    .eq('is_active', true)
    .order('name', { ascending: true })

  return (data ?? []) as StaffMember[]
}
