import { db } from '@/lib/db'

export async function createOrganization(input: { name: string; slug: string; ownerUserId: string; timezone?: string }) {
  const trialStartedAt = new Date()
  const trialEndsAt = new Date(trialStartedAt.getTime() + 14 * 24 * 60 * 60 * 1000)
  const starter = await db.plan.findUnique({ where: { key: 'starter' } })
  if (!starter) throw new Error('Default plans are not configured')
  return db.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: {
      name: input.name, slug: input.slug, timezone: input.timezone ?? 'Africa/Kampala', trialStartedAt, trialEndsAt,
      users: { connect: { id: input.ownerUserId } },
      members: { create: { userId: input.ownerUserId, role: 'owner' } },
      settings: { create: {} },
      subscription: { create: { planId: starter.id, status: 'trialing' } },
    } })
    await tx.auditEvent.create({ data: { organizationId: organization.id, actorUserId: input.ownerUserId, action: 'TRIAL_STARTED', entityType: 'Organization', entityId: organization.id } })
    return organization
  })
}

export async function syncOrganizationLifecycle(organizationId: string) {
  const organization = await db.organization.findUnique({ where: { id: organizationId }, include: { subscription: true } })
  if (!organization || organization.status === 'archived' || organization.organizationType === 'LEGACY') return organization
  const now = new Date()
  if (organization.status === 'trial' && organization.trialEndsAt && now > organization.trialEndsAt) {
    const graceEndsAt = new Date(organization.trialEndsAt.getTime() + 7 * 24 * 60 * 60 * 1000)
    const status = now > graceEndsAt ? 'suspended' : 'grace'
    const action = status === 'grace' ? 'GRACE_STARTED' : 'ORG_SUSPENDED'
    const existingEvent = await db.auditEvent.findFirst({ where: { organizationId, action, entityId: organizationId } })
    if (existingEvent) return organization
    return db.$transaction(async (tx) => {
      const suspendedAt = status === 'suspended' ? now : undefined
      const retentionEndsAt = suspendedAt ? new Date(suspendedAt.getTime() + 60 * 24 * 60 * 60 * 1000) : undefined
      const updated = await tx.organization.update({ where: { id: organizationId }, data: { status, graceStartedAt: organization.trialEndsAt, graceEndsAt, suspendedAt, retentionEndsAt } })
      await tx.auditEvent.create({ data: { organizationId, action, entityType: 'Organization', entityId: organizationId } })
      await tx.auditEvent.create({ data: { organizationId, action: 'TRIAL_EXPIRED', entityType: 'Organization', entityId: organizationId } })
      return updated
    })
  }
  return organization
}
