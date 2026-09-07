import type { Organization } from '@prisma/client'

export const DAILY_REMINDER_TITLE = 'Daily report reminder'

export function getLocalReminderWindow(now: Date, timezone: string) {
  const localHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hour12: false }).format(now))
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  return { localHour, dateKey, due: localHour >= 16 }
}

export function shouldCreateReminder(input: {
  organization: Pick<Organization, 'timezone'> & { settings?: { reminderEnabled: boolean } | null }
  submitted: boolean
  existingReminder: boolean
  now?: Date
}) {
  if (input.organization.settings?.reminderEnabled === false || input.submitted || input.existingReminder) return false
  return getLocalReminderWindow(input.now ?? new Date(), input.organization.timezone).due
}
