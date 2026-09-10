import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DAILY_REMINDER_TITLE, getLocalReminderWindow, shouldCreateReminder } from '@/lib/reminder-policy'

export async function POST(request: Request) {
  const expected = process.env.BILLING_CRON_SECRET ?? process.env.JWT_SECRET
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const organizations = await db.saaSOrganization.findMany({ include: { reportingEmployees: { where: { status: 'active' }, include: { membership: true } } } })
  let created = 0
  for (const organization of organizations) {
    const now = new Date()
    const { dateKey } = getLocalReminderWindow(now, 'Africa/Kampala')
    for (const employee of organization.reportingEmployees) {
      const submitted = await db.reportingDailyReport.findUnique({ where: { employeeId_reportDate: { employeeId: employee.id, reportDate: dateKey } }, select: { id: true } })
      const exists = await db.reportingNotification.findFirst({ where: { organizationId: organization.id, employeeId: employee.id, type: 'reminder', title: DAILY_REMINDER_TITLE, createdAt: { gte: new Date(`${dateKey}T00:00:00.000Z`) } } })
      if (!shouldCreateReminder({ organization: { ...organization, timezone: 'Africa/Kampala', settings: { reminderEnabled: true } }, submitted: Boolean(submitted), existingReminder: Boolean(exists), now })) continue
      await db.reportingNotification.create({ data: { organizationId: organization.id, employeeId: employee.id, title: DAILY_REMINDER_TITLE, message: 'Please submit your daily report before the reporting deadline.', type: 'reminder' } })
      created += 1
    }
  }
  return NextResponse.json({ created })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
