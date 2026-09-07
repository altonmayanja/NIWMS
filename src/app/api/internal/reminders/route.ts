import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: Request) {
  const expected = process.env.BILLING_CRON_SECRET ?? process.env.JWT_SECRET
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const organizations = await db.organization.findMany({ include: { settings: true, users: { where: { role: 'employee', status: 'active' }, select: { id: true } } } })
  let created = 0
  for (const organization of organizations) {
    if (organization.settings?.reminderEnabled === false) continue
    const now = new Date()
    const localHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: organization.timezone, hour: '2-digit', hour12: false }).format(now))
    if (localHour < 16) continue
    const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: organization.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
    for (const user of organization.users) {
      const submitted = await db.dailyReport.findUnique({ where: { userId_date: { userId: user.id, date: dateKey } }, select: { id: true } })
      if (submitted) continue
      const exists = await db.notification.findFirst({ where: { userId: user.id, type: 'reminder', title: 'Daily report reminder', createdAt: { gte: new Date(`${dateKey}T00:00:00.000Z`) } } })
      if (exists) continue
      await db.notification.create({ data: { userId: user.id, title: 'Daily report reminder', message: 'Please submit your daily report before the reporting deadline.', type: 'reminder' } })
      created += 1
    }
  }
  return NextResponse.json({ created })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
