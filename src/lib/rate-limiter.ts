/**
 * In-memory rate limiter for API endpoints.
 * Prevents abuse of report generation, regeneration, and bulk operations.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key)
  }
}, 5 * 60 * 1000)

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

const LIMITS: Record<string, RateLimitConfig> = {
  employee_generate: { maxRequests: 5, windowMs: 60 * 60 * 1000 },   // 5 per hour
  admin_generate: { maxRequests: 20, windowMs: 60 * 60 * 1000 },     // 20 per hour
  admin_bulk: { maxRequests: 3, windowMs: 60 * 60 * 1000 },          // 3 per hour
  password_change: { maxRequests: 5, windowMs: 15 * 60 * 1000 },     // 5 per 15 min (brute-force guard on current-password check)
}

export function checkRateLimit(
  identifier: string,
  type: keyof typeof LIMITS
): { allowed: boolean; remaining: number; resetAt: number } {
  const config = LIMITS[type]
  const key = `${type}:${identifier}`
  const now = Date.now()

  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    // New window
    store.set(key, { count: 1, resetAt: now + config.windowMs })
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs }
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt }
}

export function getRateLimitErrorMessage(type: keyof typeof LIMITS): string {
  const config = LIMITS[type]
  const windowMinutes = Math.round(config.windowMs / (60 * 1000))
  return `Rate limit exceeded. Maximum ${config.maxRequests} requests per ${windowMinutes} minutes. Please try again later.`
}
