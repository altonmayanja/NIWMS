import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DAILY_REMINDER_TITLE, getLocalReminderWindow, shouldCreateReminder } from '@/lib/reminder-policy'

const DIGEST_TITLE = 'Daily reporting digest'

function formatDeadline(deadline: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(deadline ?? '')
  if (!match) return 'the reporting deadline'
  const hours = Number(match[1])
  const minutes = match[2]
  if (Number.isNaN(hours) || hours > 23) return 'the reporting deadline'
  const suffix = hours >= 12 ? 'PM' : 'AM'
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${suffix} local time`
}

export async function POST(request: Request) {
  const expected = process.env.BILLING_CRON_SECRET ?? process.env.JWT_SECRET
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const organizations = await db.saaSOrganization.findMany({ include: { reportingEmployees: { where: { status: 'active' }, include: { membership: true } } } })
  let created = 0
  let digests = 0
  for (const organization of organizations) {
    const now = new Date()
    const orgTimezone = organization.timezone || 'Africa/Kampala'
    const { dateKey, due } = getLocalReminderWindow(now, orgTimezone, organization.reportDeadline)
    const reminderMessage = `Please submit your daily report before ${formatDeadline(organization.reportDeadline)}.`
    for (const employee of organization.reportingEmployees) {
      const submitted = await db.reportingDailyReport.findUnique({ where: { employeeId_reportDate: { employeeId: employee.id, reportDate: dateKey } }, select: { id: true } })
      const exists = await db.reportingNotification.findFirst({ where: { organizationId: organization.id, employeeId: employee.id, type: 'reminder', title: DAILY_REMINDER_TITLE, createdAt: { gte: new Date(`${dateKey}T00:00:00.000Z`) } } })
      if (!shouldCreateReminder({ organization: { ...organization, timezone: orgTimezone, settings: { reminderEnabled: organization.reminderEnabled, reportDeadline: organization.reportDeadline } }, submitted: Boolean(submitted), existingReminder: Boolean(exists), now })) continue
      await db.reportingNotification.create({ data: { organizationId: organization.id, employeeId: employee.id, title: DAILY_REMINDER_TITLE, message: reminderMessage, type: 'reminder' } })
      created += 1
    }

    // Admin digest: one per org admin per day (after the deadline window opens),
    // summarizing real submission state so managers do not need to check manually.
    if (!due || !organization.reminderEnabled) continue
    const submittedEmployeeIds = new Set(
      (await db.reportingDailyReport.findMany({ where: { organizationId: organization.id, reportDate: dateKey }, select: { employeeId: true } })).map((row) => row.employeeId),
    )
    const missing = organization.reportingEmployees
      .filter((employee) => !submittedEmployeeIds.has(employee.id))
      .map((employee) => employee.displayName)
    const total = organization.reportingEmployees.length
    const submittedCount = total - missing.length
    const missingLabel = missing.length === 0
      ? 'Everyone has reported.'
      : `Pending: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''}.`
    const digestMessage = `${submittedCount} of ${total} daily reports submitted for ${dateKey}. ${missingLabel}`

    const [saasAdmins, legacyAdmins] = await Promise.all([
      db.saaSOrganizationMembership.findMany({ where: { organizationId: organization.id, status: 'active', role: { in: ['owner', 'admin'] } }, select: { userId: true } }),
      db.user.findMany({ where: { organizationId: organization.id, role: 'admin', status: 'active' }, select: { id: true } }),
    ])
    const adminUserIds = [...new Set([...saasAdmins.map((m) => m.userId), ...legacyAdmins.map((u) => u.id)])]
    for (const adminUserId of adminUserIds) {
      const exists = await db.notification.findFirst({
        where: { userId: adminUserId, title: DIGEST_TITLE, createdAt: { gte: new Date(`${dateKey}T00:00:00.000Z`) } },
        select: { id: true },
      })
      if (exists) continue
      await db.notification.create({
        data: { userId: adminUserId, title: DIGEST_TITLE, message: digestMessage, type: 'info' },
      })
      digests += 1
    }
  }
  return NextResponse.json({ created, digests })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
