import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/password'
import { signToken, sessionCookie } from '@/lib/auth'

// POST /api/auth/login
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const username = typeof body.username === 'string' ? body.username.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const organizationInput = typeof body.organization === 'string' ? body.organization.trim() : ''
    const requestedOrganizationId = typeof body.organizationId === 'string' ? body.organizationId : undefined

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    const user = await db.user.findUnique({
      where: { username },
      include: { profile: true, memberships: { where: { status: 'active' }, include: { organization: true } } },
    })

    if (!user || user.status !== 'active') {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const isPlatformAdmin = user.role === 'super_admin'
    if (!isPlatformAdmin && !organizationInput && !requestedOrganizationId) {
      return NextResponse.json({ error: 'Organization, username, and password are required' }, { status: 400 })
    }

    const legacyOrganization = isPlatformAdmin
      ? null
      : requestedOrganizationId
        ? await db.organization.findUnique({ where: { id: requestedOrganizationId } })
        : await db.organization.findFirst({
            where: {
              OR: [
                { slug: organizationInput.toLowerCase() },
                { name: { equals: organizationInput, mode: 'insensitive' } },
              ],
            },
          })
    const canonicalMembership = !isPlatformAdmin
      ? await db.saaSOrganizationMembership.findFirst({
          where: {
            userId: user.id,
            status: 'active',
            organization: requestedOrganizationId
              ? { id: requestedOrganizationId }
              : { OR: [{ slug: organizationInput.toLowerCase() }, { name: { equals: organizationInput, mode: 'insensitive' } }] },
          },
          include: { organization: true },
        })
      : null
    const organization = canonicalMembership?.organization ?? legacyOrganization

    if (!isPlatformAdmin && (!organization || !['active', 'trial', 'grace'].includes(organization.status))) {
      return NextResponse.json({ error: 'Invalid organization credentials.' }, { status: 401 })
    }

    const membership = canonicalMembership ?? (legacyOrganization
      ? user.memberships.find((item) => item.organizationId === legacyOrganization.id)
      : undefined)
    const isLegacyOrganizationUser = Boolean(legacyOrganization && legacyOrganization.organizationType === 'LEGACY' && user.organizationId === legacyOrganization.id)
    if (!isPlatformAdmin && (!membership && !isLegacyOrganizationUser)) {
      return NextResponse.json({ error: 'Invalid organization credentials.' }, { status: 401 })
    }


    const isValid = await verifyPassword(password, user.passwordHash)
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    const token = await signToken({
      userId: user.id,
      username: user.username,
      role: user.role as 'admin' | 'employee' | 'super_admin',
      organizationId: membership?.organizationId ?? user.organizationId ?? undefined,
      membershipId: membership?.id,
      organizationRole: membership?.role,
    })

    // Audit failures must not turn a successful authentication into a 500 response.
    try {
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'login',
          details: JSON.stringify({ organizationId: organization?.id ?? null }),
        },
      })
    } catch (auditError) {
      console.error('Login audit event failed:', auditError)
    }

    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
        organizationId: membership?.organizationId ?? organization?.id,
        membershipId: membership?.id,
        organizationRole: membership?.role,
        organization: organization ? { id: organization.id, name: organization.name, slug: organization.slug } : null,
        profile: user.profile ? {
          employeeId: user.profile.employeeId,
          position: user.profile.position,
        } : null,
      },
    })
    response.cookies.set(sessionCookie(token))
    return response
  } catch (error) {
    console.error('Login error:', error)
    if (error instanceof Error && error.name === 'PrismaClientInitializationError') {
      return NextResponse.json(
        { error: 'Authentication service is not configured. Please contact support.' },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
