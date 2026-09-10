import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyToken, getTokenFromRequest } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { requireOrganizationAdmin } from '@/lib/tenant'
import { canAddEmployee, getEmployeeLimit } from '@/lib/entitlements'

// Helper: authenticate admin
async function authenticateAdmin(request: NextRequest) {
  const token = getTokenFromRequest(request)
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload || payload.role !== 'admin') return null
  return payload
}

// Predefined UFMI positions
const POSITIONS = [
  'Chief Executive Officer',
  'Operations and Administrative Officer',
  'Accounting Officer',
  'IT Officer',
  'Membership Officer',
  'Driver',
  'Copyright Inspector',
  'Licensing Officer',
]

// GET /api/admin/employees - List all employees
export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateAdmin(request)
    if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { context, response } = await requireOrganizationAdmin(payload)
    if (!context) return response

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    const where: Record<string, unknown> = { organizationId: context.organizationId }

    if (status) {
      where.status = status
    }
    if (search) {
      where.OR = [
        { username: { contains: search } },
        { profile: { employeeId: { contains: search } } },
        { profile: { position: { contains: search } } },
      ]
    }

    const employees = await db.user.findMany({
      where,
      include: { profile: true, _count: { select: { reports: true } } },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ employees, positions: POSITIONS })
  } catch (error) {
    console.error('Get employees error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/admin/employees - Create new employee
export async function POST(request: NextRequest) {
  try {
    const payload = await authenticateAdmin(request)
    if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { context, response } = await requireOrganizationAdmin(payload)
    if (!context) return response

    const body = await request.json()
    const { username, password, employeeId, position } = body

    const canAdd = await canAddEmployee(context.organizationId)
    if (!canAdd) {
      const limit = await getEmployeeLimit(context.organizationId)
      return NextResponse.json({ error: `Employee limit reached for this plan (${limit}). Upgrade your plan to add another employee.` }, { status: 409 })
    }

    // Validate required fields
    if (!username || !password || !employeeId || !position) {
      return NextResponse.json(
        { error: 'All fields are required: username, password, employeeId, position' },
        { status: 400 }
      )
    }

    // Validate position - must be one of the predefined UFMI positions
    if (!POSITIONS.includes(position)) {
      return NextResponse.json(
        { error: `Invalid position. Must be one of: ${POSITIONS.join(', ')}` },
        { status: 400 }
      )
    }

    // Check username uniqueness
    const existingUser = await db.user.findFirst({ where: { username, organizationId: context.organizationId } })
    if (existingUser) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 409 }
      )
    }

    // Check employeeId uniqueness
    const existingProfile = await db.employeeProfile.findFirst({ where: { employeeId, user: { organizationId: context.organizationId } } })
    if (existingProfile) {
      return NextResponse.json(
        { error: 'Employee ID already exists' },
        { status: 409 }
      )
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create user with profile
    const user = await db.user.create({
      data: {
        username,
        passwordHash,
        organizationId: context.organizationId,
        role: 'employee',
        status: 'active',
        profile: {
          create: {
            employeeId,
            position,
          },
        },
        memberships: {
          create: { organizationId: context.organizationId, role: 'member', status: 'active' },
        },
      },
      include: { profile: true },
    })

    const canonicalMembership = await db.saaSOrganizationMembership.upsert({
      where: { organizationId_userId: { organizationId: context.organizationId, userId: user.id } },
      update: { role: 'member', status: 'active' },
      create: {
        organizationId: context.organizationId,
        userId: user.id,
        role: 'member',
        status: 'active',
      },
    })
    const positionCode = position.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const canonicalPosition = await db.reportingPosition.upsert({
      where: { organizationId_code: { organizationId: context.organizationId, code: positionCode } },
      update: { name: position },
      create: { organizationId: context.organizationId, name: position, code: positionCode },
    })
    const canonicalEmployee = await db.reportingEmployee.create({
      data: {
        organizationId: context.organizationId,
        membershipId: canonicalMembership.id,
        employeeCode: employeeId,
        displayName: username,
        positionId: canonicalPosition.id,
        status: 'active',
      },
      include: { position: true, membership: true },
    })

    await db.saaSAuditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: payload.userId,
        action: 'employee_created',
        resourceType: 'reporting_employee',
        resourceId: canonicalEmployee.id,
        metadata: { userId: user.id, username, employeeId, position },
      },
    })

    return NextResponse.json({ ...canonicalEmployee, user }, { status: 201 })
  } catch (error) {
    console.error('Create employee error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
