import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyToken, getTokenFromRequest } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { requireOrganizationAdmin } from '@/lib/tenant'

// Helper: authenticate admin
async function authenticateAdmin(request: NextRequest) {
  const token = getTokenFromRequest(request)
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload || payload.role !== 'admin') return null
  return payload
}

// PATCH /api/admin/employees/[id] - Update employee
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await authenticateAdmin(request)
    if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { context, response } = await requireOrganizationAdmin(payload)
    if (!context) return response

    const { id } = await params
    const body = await request.json()
    const { username, status, position, employeeId, password } = body

    const user = await db.user.findUnique({
      where: { id, organizationId: context.organizationId },
      include: { profile: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Don't allow modifying the main admin
    if (user.role === 'admin') {
      return NextResponse.json(
        { error: 'Cannot modify admin users through this endpoint' },
        { status: 400 }
      )
    }

    const updates: Record<string, unknown> = {}
    const profileUpdates: Record<string, unknown> = {}

    // Update username
    if (username && typeof username === 'string' && username.trim()) {
      // Check if username is taken by another user
      const existing = await db.user.findFirst({ where: { username: username.trim(), organizationId: context.organizationId, NOT: { id } } })
      if (existing) {
        return NextResponse.json({ error: 'Username is already taken' }, { status: 409 })
      }
      updates.username = username.trim()
    }

    if (status && ['active', 'suspended', 'archived'].includes(status)) {
      updates.status = status
    }

    if (position) {
      profileUpdates.position = position
    }

    // Update employee ID
    if (employeeId && typeof employeeId === 'string' && employeeId.trim()) {
      const existing = await db.employeeProfile.findFirst({ where: { employeeId: employeeId.trim(), NOT: { userId: id } } })
      if (existing) {
        return NextResponse.json({ error: 'Employee ID is already taken' }, { status: 409 })
      }
      profileUpdates.employeeId = employeeId.trim()
    }

    if (password) {
      updates.passwordHash = await hashPassword(password)
    }

    // Update user
    if (Object.keys(updates).length > 0) {
      await db.user.update({
        where: { id, organizationId: context.organizationId },
        data: updates,
      })
    }

    // Update profile
    if (Object.keys(profileUpdates).length > 0 && user.profile) {
      await db.employeeProfile.update({
        where: { userId: id },
        data: profileUpdates,
      })
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: payload.userId,
        action: 'employee_updated',
        details: JSON.stringify({ targetUserId: id, updates, profileUpdates }),
      },
    })

    const updatedUser = await db.user.findUnique({
      where: { id, organizationId: context.organizationId },
      include: { profile: true },
    })

    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error('Update employee error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/admin/employees/[id] - Delete employee
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await authenticateAdmin(request)
    if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { context, response } = await requireOrganizationAdmin(payload)
    if (!context) return response

    const { id } = await params

    const user = await db.user.findUnique({
      where: { id, organizationId: context.organizationId },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.role === 'admin') {
      return NextResponse.json(
        { error: 'Cannot delete admin users' },
        { status: 400 }
      )
    }

    await db.user.delete({ where: { id, organizationId: context.organizationId } })

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: payload.userId,
        action: 'employee_deleted',
        details: JSON.stringify({ targetUserId: id, username: user.username }),
      },
    })

    return NextResponse.json({ message: 'Employee deleted successfully' })
  } catch (error) {
    console.error('Delete employee error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
