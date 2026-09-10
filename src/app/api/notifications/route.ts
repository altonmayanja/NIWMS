import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest, unauthorizedResponse } from '@/lib/auth'
import { getTenantContext } from '@/lib/tenant'

export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateRequest(request)
    if (!payload) return unauthorizedResponse()
    const tenant = await getTenantContext(payload)
    if (!tenant) return unauthorizedResponse('Active organization membership required')
    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get('unread') === 'true'
    const limit = Math.min(50, Math.max(1, Number.parseInt(searchParams.get('limit') || '30', 10) || 30))
    const employee = await db.reportingEmployee.findFirst({ where: { organizationId: tenant.organizationId, membership: { userId: payload.userId, status: 'active' } } })
    const notifications = await db.reportingNotification.findMany({
      where: { organizationId: tenant.organizationId, ...(employee ? { OR: [{ employeeId: employee.id }, { employeeId: null }] } : {}), ...(unreadOnly ? { read: false, employeeId: employee?.id } : {}) },
      orderBy: { createdAt: 'desc' }, take: limit,
    })
    const unreadCount = employee ? await db.reportingNotification.count({ where: { organizationId: tenant.organizationId, employeeId: employee.id, read: false } }) : 0
    return NextResponse.json({ notifications, unreadCount })
  } catch (error) {
    console.error('List notifications error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await authenticateRequest(request)
    if (!payload) return unauthorizedResponse()
    const tenant = await getTenantContext(payload)
    if (!tenant) return unauthorizedResponse('Active organization membership required')
    const employee = await db.reportingEmployee.findFirst({ where: { organizationId: tenant.organizationId, membership: { userId: payload.userId, status: 'active' } } })
    if (!employee) return NextResponse.json({ success: true })
    const { action } = await request.json()
    if (action !== 'mark-all-read') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    await db.reportingNotification.updateMany({ where: { organizationId: tenant.organizationId, employeeId: employee.id, read: false }, data: { read: true } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update notifications error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
