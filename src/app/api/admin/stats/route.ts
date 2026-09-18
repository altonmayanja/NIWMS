import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { requireOrganizationAdmin } from '@/lib/tenant'
import { db } from '@/lib/db'

// The admin dashboard consumes a stable API contract:
//   missingTodayReports: { id, username, profile? }
//   recentReports:       DailyReport-shaped rows with `user`
// The canonical reporting models store identity via membership.userId, so
// this route normalizes them (with a batched user lookup) into that contract.
export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateRequest(request)
    const { context, response } = await requireOrganizationAdmin(payload)
    if (!context) return response
    const today = new Date().toISOString().split('T')[0]
    const currentMonth = today.substring(0, 7)
    const base = { organizationId: context.organizationId }
    const employees = await db.reportingEmployee.findMany({
      where: { ...base, status: 'active' },
      include: { membership: true, position: true },
    })
    const [totalReports, todayReports, monthReports, recentRows] = await Promise.all([
      db.reportingDailyReport.count({ where: base }),
      db.reportingDailyReport.count({ where: { ...base, reportDate: today } }),
      db.reportingDailyReport.count({ where: { ...base, reportDate: { startsWith: currentMonth } } }),
      db.reportingDailyReport.findMany({
        where: base,
        take: 10,
        include: { employee: { include: { position: true, membership: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ])
    const submittedToday = new Set((await db.reportingDailyReport.findMany({ where: { ...base, reportDate: today }, select: { employeeId: true } })).map((row) => row.employeeId))

    const relatedUserIds = [
      ...new Set([
        ...employees.map((employee) => employee.membership?.userId).filter((id): id is string => Boolean(id)),
        ...recentRows.map((report) => report.employee.membership?.userId).filter((id): id is string => Boolean(id)),
      ]),
    ]
    const relatedUsers = await db.user.findMany({
      where: { id: { in: relatedUserIds } },
      select: { id: true, username: true, role: true, status: true },
    })
    const usersById = new Map(relatedUsers.map((user) => [user.id, user]))

    const profileFor = (employee: { employeeCode: string; displayName: string; position?: { name: string } | null }) => ({
      employeeId: employee.employeeCode,
      position: employee.position?.name ?? null,
    })
    const userFor = (userId: string | null | undefined, fallbackName: string) => {
      const user = userId ? usersById.get(userId) : undefined
      return {
        id: user?.id ?? userId ?? fallbackName,
        username: user?.username ?? fallbackName,
        role: user?.role ?? 'employee',
        status: user?.status ?? 'active',
      }
    }

    const missingTodayReports = employees
      .filter((employee) => !submittedToday.has(employee.id))
      .map((employee) => ({
        ...userFor(employee.membership?.userId, employee.displayName),
        id: employee.id,
        profile: profileFor(employee),
      }))
    const recentReports = recentRows.map((report) => ({
      id: report.id,
      userId: report.employee.membership?.userId ?? report.employee.id,
      date: report.reportDate,
      activityText: report.activityText,
      location: report.location,
      timeIn: report.timeIn,
      timeOut: report.timeOut,
      comments: report.comments,
      createdAt: report.createdAt.toISOString(),
      user: {
        ...userFor(report.employee.membership?.userId, report.employee.displayName),
        profile: profileFor(report.employee),
      },
    }))
    return NextResponse.json({
      totalEmployees: employees.length,
      activeEmployees: employees.length,
      suspendedEmployees: await db.reportingEmployee.count({ where: { ...base, status: 'suspended' } }),
      totalReports,
      todayReports,
      monthReports,
      currentMonth,
      today,
      missingTodayReports,
      recentReports,
    })
  } catch (error) {
    console.error('Get stats error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
