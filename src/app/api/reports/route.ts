import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest, unauthorizedResponse } from '@/lib/auth'
import { getTenantContext } from '@/lib/tenant'

function validTime(value: unknown): value is string {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

async function getEmployee(userId: string, organizationId: string) {
  return db.reportingEmployee.findFirst({
    where: { organizationId, membership: { userId, status: 'active' }, status: 'active' },
  })
}

export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateRequest(request)
    if (!payload) return unauthorizedResponse()
    const tenant = await getTenantContext(payload)
    if (!tenant) return NextResponse.json({ error: 'Active organization membership required' }, { status: 403 })
    if (payload.role !== 'employee') return NextResponse.json({ error: 'Use /api/admin/reports for admin access' }, { status: 400 })

    const employee = await getEmployee(payload.userId, tenant.organizationId)
    if (!employee) return NextResponse.json([])
    const month = new URL(request.url).searchParams.get('month')
    const reports = await db.reportingDailyReport.findMany({
      where: { organizationId: tenant.organizationId, employeeId: employee.id, ...(month ? { reportDate: { startsWith: month } } : {}) },
      orderBy: { reportDate: 'desc' },
    })
    return NextResponse.json(reports)
  } catch (error) {
    console.error('Get reports error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await authenticateRequest(request)
    if (!payload) return unauthorizedResponse()
    const tenant = await getTenantContext(payload)
    if (!tenant) return NextResponse.json({ error: 'Active organization membership required' }, { status: 403 })
    const employee = await getEmployee(payload.userId, tenant.organizationId)
    if (!employee) return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 })

    const body = await request.json()
    const { date, activityText, location, timeIn, timeOut, comments } = body
    if (!validDate(date) || typeof activityText !== 'string' || !activityText.trim()) {
      return NextResponse.json({ error: 'Date and activity text are required' }, { status: 400 })
    }
    if (timeIn && !validTime(timeIn)) return NextResponse.json({ error: 'Invalid time-in format. Use HH:MM (e.g. 08:00)' }, { status: 400 })
    if (timeOut && !validTime(timeOut)) return NextResponse.json({ error: 'Invalid time-out format. Use HH:MM (e.g. 17:00)' }, { status: 400 })

    const existing = await db.reportingDailyReport.findUnique({ where: { employeeId_reportDate: { employeeId: employee.id, reportDate: date } } })
    if (existing) return NextResponse.json({ error: 'You have already submitted a report for this date' }, { status: 409 })

    const report = await db.reportingDailyReport.create({
      data: {
        organizationId: tenant.organizationId,
        employeeId: employee.id,
        reportDate: date,
        activityText: activityText.trim(),
        location: typeof location === 'string' ? location.trim() || null : null,
        timeIn: typeof timeIn === 'string' ? timeIn.trim() || null : null,
        timeOut: typeof timeOut === 'string' ? timeOut.trim() || null : null,
        comments: typeof comments === 'string' ? comments.trim() || null : null,
      },
    })
    await db.saaSAuditLog.create({
      data: {
        organizationId: tenant.organizationId,
        actorUserId: payload.userId,
        action: 'report_created',
        resourceType: 'reporting_daily_report',
        resourceId: report.id,
        metadata: { date },
      },
    })
    return NextResponse.json(report, { status: 201 })
  } catch (error) {
    console.error('Create report error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
