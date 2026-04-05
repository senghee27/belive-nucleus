import { NextResponse } from 'next/server'
import { getAllStaff } from '@/lib/staff-directory'

export async function GET() {
  try {
    const staff = await getAllStaff()
    return NextResponse.json({ ok: true, staff })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
