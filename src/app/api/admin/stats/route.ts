import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { requireOrganizationAdmin } from '@/lib/tenant'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateRequest(request)
    const { context, response } = await requireOrganizationAdmin(payload)
    if (!context) return response
    const today = new Date().toISOString().split('T')[0]
    const currentMonth = today.substring(0, 7)
    const base = { organizationId: context.organizationId }
    const employees = await db.reportingEmployee.findMany({ where: { ...base, status: 'active' }, include: { membership: true, position: true } })
    const [totalReports, todayReports, monthReports, recentReports] = await Promise.all([
      db.reportingDailyReport.count({ where: base }),
      db.reportingDailyReport.count({ where: { ...base, reportDate: today } }),
      db.reportingDailyReport.count({ where: { ...base, reportDate: { startsWith: currentMonth } } }),
      db.reportingDailyReport.findMany({ where: base, take: 10, include: { employee: { include: { position: true, membership: true } } }, orderBy: { createdAt: 'desc' } }),
    ])
    const submittedToday = new Set((await db.reportingDailyReport.findMany({ where: { ...base, reportDate: today }, select: { employeeId: true } })).map((row) => row.employeeId))
    return NextResponse.json({ totalEmployees: employees.length, activeEmployees: employees.length, suspendedEmployees: await db.reportingEmployee.count({ where: { ...base, status: 'suspended' } }), totalReports, todayReports, monthReports, currentMonth, today, missingTodayReports: employees.filter((employee) => !submittedToday.has(employee.id)), recentReports })
  } catch (error) {
    console.error('Get stats error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
