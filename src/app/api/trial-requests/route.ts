import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Public endpoint backing the marketing "Start free trial" form.
// Captures prospective-customer details for review by a Natural Intellects
// platform administrator in the Control Center. No authentication — this is
// the top of the commercial funnel — so input validation, duplicate
// suppression, and a light per-IP rate limit guard against spam.

const ALLOWED_INDUSTRIES = [
  'Professional services',
  'NGO or field organization',
  'School or education',
  'Technology',
  'Other',
]

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// In-memory rate limit: 5 submissions per IP per rolling hour. Best-effort
// spam damping for a single-instance deployment; not a distributed solution.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_MAX = 5
const submissionTimestamps = new Map<string, number[]>()

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (submissionTimestamps.get(ip) ?? []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) {
    submissionTimestamps.set(ip, recent)
    return true
  }
  recent.push(now)
  submissionTimestamps.set(ip, recent)
  return false
}

export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request)
    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many requests from this address. Please try again later.' },
        { status: 429 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const organizationName = typeof body.organizationName === 'string' ? body.organizationName.trim() : ''
    const contactName = typeof body.contactName === 'string' ? body.contactName.trim() : ''
    const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim().toLowerCase() : ''
    const industry = typeof body.industry === 'string' ? body.industry.trim() : ''

    if (organizationName.length < 2 || organizationName.length > 120) {
      return NextResponse.json({ error: 'Organization name must be between 2 and 120 characters.' }, { status: 400 })
    }
    if (contactName.length < 2 || contactName.length > 120) {
      return NextResponse.json({ error: 'Your name must be between 2 and 120 characters.' }, { status: 400 })
    }
    if (!EMAIL_PATTERN.test(contactEmail) || contactEmail.length > 200) {
      return NextResponse.json({ error: 'A valid work email is required.' }, { status: 400 })
    }
    if (!ALLOWED_INDUSTRIES.includes(industry)) {
      return NextResponse.json({ error: 'Please select an industry from the list.' }, { status: 400 })
    }

    // Duplicate suppression: one open request per contact email. Approved or
    // dismissed requests do not block a legitimate re-application later.
    const existing = await db.trialRequest.findFirst({
      where: { contactEmail, status: 'pending' },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'A trial request with this email is already under review. We will be in touch shortly.' },
        { status: 409 },
      )
    }

    const trialRequest = await db.trialRequest.create({
      data: { organizationName, contactName, contactEmail, industry },
      select: { id: true, createdAt: true },
    })

    return NextResponse.json(
      {
        id: trialRequest.id,
        message: 'Request received. Our team will review it and reach out to set up your workspace.',
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('Trial request submission failed:', error)
    return NextResponse.json({ error: 'Unable to submit your request right now. Please try again.' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
