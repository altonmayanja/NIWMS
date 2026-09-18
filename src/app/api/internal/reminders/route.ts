import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DAILY_REMINDER_TITLE, getLocalReminderWindow, shouldCreateReminder } from '@/lib/reminder-policy'

export async function POST(request: Request) {
  const expected = process.env.BILLING_CRON_SECRET ?? process.env.JWT_SECRET
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const organizations = await db.saaSOrganization.findMany({ include: { reportingEmployees: { where: { status: 'active' }, include: { membership: true } } } })
  let created = 0
  const formatDeadline = (deadline: string | null | undefined) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(deadline ?? '')
    if (!match) return 'the reporting deadline'
    const hours = Number(match[1])
    const minutes = match[2]
    if (Number.isNaN(hours) || hours > 23) return 'the reporting deadline'
    const suffix = hours >= 12 ? 'PM' : 'AM'
    return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${suffix} local time`
  }
  for (const organization of organizations) {
    const now = new Date()
    const orgTimezone = organization.timezone || 'Africa/Kampala'
    const { dateKey } = getLocalReminderWindow(now, orgTimezone, organization.reportDeadline)
    const reminderMessage = organization.reminderEnabled
      ? `Please submit your daily report before ${formatDeadline(organization.reportDeadline)}.`
      : 'Please submit your daily report.'
    for (const employee of organization.reportingEmployees) {
      const submitted = await db.reportingDailyReport.findUnique({ where: { employeeId_reportDate: { employeeId: employee.id, reportDate: dateKey } }, select: { id: true } })
      const exists = await db.reportingNotification.findFirst({ where: { organizationId: organization.id, employeeId: employee.id, type: 'reminder', title: DAILY_REMINDER_TITLE, createdAt: { gte: new Date(`${dateKey}T00:00:00.000Z`) } } })
      if (!shouldCreateReminder({ organization: { ...organization, timezone: orgTimezone, settings: { reminderEnabled: organization.reminderEnabled, reportDeadline: organization.reportDeadline } }, submitted: Boolean(submitted), existingReminder: Boolean(exists), now })) continue
      await db.reportingNotification.create({ data: { organizationId: organization.id, employeeId: employee.id, title: DAILY_REMINDER_TITLE, message: reminderMessage, type: 'reminder' } })
      created += 1
    }
  }
  return NextResponse.json({ created })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
