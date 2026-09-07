export type EmailMessage = {
  to: string
  subject: string
  text: string
}

export class EmailConfigurationError extends Error {
  constructor() {
    super('Email delivery is not configured')
    this.name = 'EmailConfigurationError'
  }
}

export async function sendEmail(_message: EmailMessage) {
  const provider = process.env.EMAIL_PROVIDER
  const apiKey = process.env.EMAIL_API_KEY
  const from = process.env.EMAIL_FROM
  if (!provider || provider === 'disabled' || !apiKey || !from) throw new EmailConfigurationError()
  throw new Error(`Email provider adapter not implemented for ${provider}`)
}

export const emailEvents = {
  welcome: (to: string) => ({ to, subject: 'Welcome to Natural Intellects', text: 'Your organization workspace is ready.' }),
  trialWarning: (to: string) => ({ to, subject: 'Your trial is ending soon', text: 'Your Natural Intellects trial is ending soon.' }),
  paymentFailure: (to: string) => ({ to, subject: 'Payment action required', text: 'Your latest payment could not be completed.' }),
  dailyReminder: (to: string) => ({ to, subject: 'Daily report reminder', text: 'Please submit your daily report before the reporting deadline.' }),
}
