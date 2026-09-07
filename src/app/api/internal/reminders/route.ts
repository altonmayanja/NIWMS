import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DAILY_REMINDER_TITLE, getLocalReminderWindow, shouldCreateReminder } from '@/lib/reminder-policy'

export async function POST(request: Request) {
  const expected = process.env.BILLING_CRON_SECRET ?? process.env.JWT_SECRET
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const organizations = await db.organization.findMany({ include: { settings: true, users: { where: { role: 'employee', status: 'active' }, select: { id: true } } } })
  let created = 0
  for (const organization of organizations) {
    const now = new Date()
    const { dateKey } = getLocalReminderWindow(now, organization.timezone)
    for (const user of organization.users) {
      const submitted = await db.dailyReport.findUnique({ where: { userId_date: { userId: user.id, date: dateKey } }, select: { id: true } })
      const exists = await db.notification.findFirst({ where: { userId: user.id, type: 'reminder', title: DAILY_REMINDER_TITLE, createdAt: { gte: new Date(`${dateKey}T00:00:00.000Z`) } } })
      if (!shouldCreateReminder({ organization, submitted: Boolean(submitted), existingReminder: Boolean(exists), now })) continue
      await db.notification.create({ data: { userId: user.id, title: DAILY_REMINDER_TITLE, message: 'Please submit your daily report before the reporting deadline.', type: 'reminder' } })
      created += 1
    }
  }
  return NextResponse.json({ created })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
