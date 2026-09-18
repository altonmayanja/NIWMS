import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyToken, getTokenFromRequest } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { hashPassword } from '@/lib/password'
import { checkRateLimit, getRateLimitErrorMessage } from '@/lib/rate-limiter'
import { queueEmail, passwordChangedEmail } from '@/lib/email'

// Password policy: at least 8 characters with at least one letter and one number.
// This matches the strength meter enforced in the workspace Settings UI.
function validatePasswordPolicy(password: string): string | null {
  if (password.length < 8) {
    return 'New password must be at least 8 characters long'
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'New password must contain at least one letter and one number'
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request)
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Brute-force guard: the current-password check must not be guessable.
    const limit = checkRateLimit(payload.userId, 'password_change')
    if (!limit.allowed) {
      return NextResponse.json({ error: getRateLimitErrorMessage('password_change') }, { status: 429 })
    }

    const { oldPassword, newPassword } = await request.json()

    if (!oldPassword || !newPassword) {
      return NextResponse.json({ error: 'Old password and new password are required' }, { status: 400 })
    }

    const policyError = validatePasswordPolicy(newPassword)
    if (policyError) {
      return NextResponse.json({ error: policyError }, { status: 400 })
    }

    if (oldPassword === newPassword) {
      return NextResponse.json({ error: 'New password must be different from the current password' }, { status: 400 })
    }

    // Get user with password
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, username: true, passwordHash: true },
    })

    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify old password
    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash)
    if (!isMatch) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }

    // Hash (bcrypt-12, system standard) and update new password, clearing the
    // temporary-password flag so the first-login nudge disappears.
    const hashedPassword = await hashPassword(newPassword)
    const passwordChangedAt = new Date()
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashedPassword,
        mustChangePassword: false,
        passwordChangedAt,
      },
    })

    // Security alert: confirm the credential change to email-like usernames.
    if (user.username.includes('@')) {
      await queueEmail(passwordChangedEmail({ to: user.username, when: passwordChangedAt }))
    }

    return NextResponse.json({
      message: 'Password changed successfully',
      mustChangePassword: false,
      passwordChangedAt: passwordChangedAt.toISOString(),
    })
  } catch (error) {
    console.error('Change password error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
