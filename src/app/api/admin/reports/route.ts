import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { requireOrganizationAdmin } from '@/lib/tenant'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateRequest(request)
    const { context, response } = await requireOrganizationAdmin(payload)
    if (!context) return response
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const month = searchParams.get('month')
    const employeeId = searchParams.get('employeeId')
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '50', 10) || 50))
    const where = { organizationId: context.organizationId, ...(date ? { reportDate: date } : month ? { reportDate: { startsWith: month } } : {}), ...(employeeId ? { employeeId } : {}) }
    const [reports, total] = await Promise.all([
      db.reportingDailyReport.findMany({ where, include: { employee: { include: { position: true, department: true, membership: true } } }, orderBy: { reportDate: 'desc' }, skip: (page - 1) * limit, take: limit }),
      db.reportingDailyReport.count({ where }),
    ])
    return NextResponse.json({ reports, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
  } catch (error) {
    console.error('Get admin reports error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
