import { describe, expect, it } from 'vitest'
import { EmailConfigurationError, emailEvents, sendEmail } from '@/lib/email'

describe('email delivery boundary', () => {
  it('fails clearly when delivery is disabled', async () => {
    await expect(sendEmail(emailEvents.dailyReminder('employee@example.test'))).rejects.toBeInstanceOf(EmailConfigurationError)
  })

  it('keeps event copy provider-independent', () => {
    expect(emailEvents.paymentFailure('owner@example.test')).toMatchObject({
      to: 'owner@example.test',
      subject: 'Payment action required',
    })
  })
})
