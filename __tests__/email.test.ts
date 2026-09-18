import { describe, expect, it } from 'vitest'
import { EmailConfigurationError, emailEvents, sendEmail } from '@/lib/email'

describe('email delivery boundary', () => {
  it('fails clearly when delivery is disabled', async () => {
    // Pin the provider explicitly: bun auto-loads .env, so the ambient value
    // depends on the sandbox. The tested invariant is the disabled state.
    const previous = process.env.EMAIL_PROVIDER
    process.env.EMAIL_PROVIDER = 'disabled'
    try {
      await expect(sendEmail(emailEvents.dailyReminder('employee@example.test'))).rejects.toBeInstanceOf(EmailConfigurationError)
    } finally {
      if (previous === undefined) delete process.env.EMAIL_PROVIDER
      else process.env.EMAIL_PROVIDER = previous
    }
  })

  it('keeps event copy provider-independent', () => {
    expect(emailEvents.paymentFailure('owner@example.test')).toMatchObject({
      to: 'owner@example.test',
      subject: 'Payment action required',
    })
  })
})
