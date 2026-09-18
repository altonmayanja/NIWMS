import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireTenant, requireOrganizationAdmin } from '@/lib/tenant'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  const { context, response } = await requireTenant(auth)
  if (!context) return response
  const organization = await db.saaSOrganization.findUnique({ where: { id: context.organizationId }, include: { subscriptions: { include: { plan: true } } } })
  if (!organization) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  const subscription = organization.subscriptions[0] || null
  const plan = subscription?.plan || null
  const [employeeCount] = await Promise.all([
    db.reportingEmployee.count({ where: { organizationId: organization.id, status: { not: 'archived' } } }),
  ])
  const employeeLimit = plan?.maxMembers ?? null
  return NextResponse.json({
    organization: { id: organization.id, status: organization.status, trialStartedAt: organization.trialStartedAt, trialEndsAt: organization.trialEndsAt },
    subscription: subscription
      ? {
          status: subscription.status,
          provider: subscription.provider,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: Boolean(subscription.canceledAt),
          trialEndsAt: subscription.trialEndsAt,
          plan: {
            key: plan?.code ?? '',
            name: plan?.name ?? 'Unassigned',
            // Stored in minor units (UGX cents); the UI presents whole UGX.
            monthlyPrice: plan ? plan.monthlyPriceCents / 100 : 0,
            maxEmployees: plan?.maxMembers ?? null,
          },
        }
      : null,
    plan,
    usage: { employeeCount, employeeLimit, canAddEmployee: employeeLimit === null || employeeCount < employeeLimit },
  })
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  const { context, response } = await requireOrganizationAdmin(auth)
  if (!context) return response
  const body = await request.json().catch(() => null)
  if (body?.action === 'cancel') {
    const subscription = await db.saaSSubscription.findUnique({ where: { organizationId: context.organizationId } })
    if (!subscription || subscription.status !== 'active') return NextResponse.json({ error: 'Only active paid subscriptions can be cancelled' }, { status: 409 })
    const updated = await db.saaSSubscription.update({ where: { id: subscription.id }, data: { canceledAt: new Date() } })
    await db.saaSAuditLog.create({ data: { organizationId: context.organizationId, actorUserId: context.userId, action: 'SUBSCRIPTION_CANCELLED', resourceType: 'SaaSSubscription', resourceId: subscription.id, metadata: {} } })
    return NextResponse.json({ subscription: updated })
  }
  return NextResponse.json({ error: 'Billing provider checkout is not configured for this deployment' }, { status: 503 })
}
