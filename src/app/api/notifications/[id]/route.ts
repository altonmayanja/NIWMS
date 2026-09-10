import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest, unauthorizedResponse } from '@/lib/auth'
import { getTenantContext } from '@/lib/tenant'

async function resolveNotification(request: NextRequest, id: string) {
  const payload = await authenticateRequest(request)
  if (!payload) return { response: unauthorizedResponse() }
  const tenant = await getTenantContext(payload)
  if (!tenant) return { response: unauthorizedResponse('Active organization membership required') }
  const employee = await db.reportingEmployee.findFirst({ where: { organizationId: tenant.organizationId, membership: { userId: payload.userId, status: 'active' } } })
  const notification = employee ? await db.reportingNotification.findFirst({ where: { id, organizationId: tenant.organizationId, OR: [{ employeeId: employee.id }, { employeeId: null }] } }) : null
  if (!notification) return { response: NextResponse.json({ error: 'Notification not found' }, { status: 404 }) }
  return { payload, tenant, employee, notification }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolved = await resolveNotification(request, (await params).id)
    if ('response' in resolved) return resolved.response
    if (resolved.notification.employeeId !== resolved.employee?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await db.reportingNotification.update({ where: { id: resolved.notification.id }, data: { read: true } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Mark notification read error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolved = await resolveNotification(request, (await params).id)
    if ('response' in resolved) return resolved.response
    if (resolved.notification.employeeId !== resolved.employee?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await db.reportingNotification.delete({ where: { id: resolved.notification.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete notification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
