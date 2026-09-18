'use client'

import Link from 'next/link'
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'

const INDUSTRIES = [
  'Professional services',
  'NGO or field organization',
  'School or education',
  'Technology',
  'Other',
]

interface QuoteSelection {
  planName: string
  planKey: string
  intervalLabel: string
  interval: string
  seats: number | null
  total: number | null
  vatRate: number | null
  periodStartLabel: string
  periodEndLabel: string
}

export default function StartFreeTrialPage() {
  const [organizationName, setOrganizationName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [industry, setIndustry] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Pricing selection carried from the marketing calculator (?plan=&interval=&seats=).
  const [selection, setSelection] = useState<QuoteSelection | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const planKey = params.get('plan')
    const interval = params.get('interval')
    if (!planKey) return
    const seatsRaw = Number.parseInt(params.get('seats') ?? '', 10)
    setSelection({
      planKey,
      planName: planKey.charAt(0).toUpperCase() + planKey.slice(1),
      interval: interval && ['monthly', 'quarterly', 'annual'].includes(interval) ? interval : 'monthly',
      intervalLabel: interval === 'quarterly' ? 'Quarterly' : interval === 'annual' ? 'Annual' : 'Monthly',
      seats: Number.isFinite(seatsRaw) && seatsRaw > 0 ? seatsRaw : null,
      total: null,
      vatRate: null,
      periodStartLabel: '',
      periodEndLabel: '',
    })
  }, [])

  // Verify the selection against the billing engine so the trial request shows
  // the same definitive numbers the platform will use.
  useEffect(() => {
    if (!selection) return
    const seatsQuery = selection.seats ? `&seats=${selection.seats}` : ''
    let cancelled = false
    fetch(`/api/billing/quote?plan=${selection.planKey}&interval=${selection.interval}${seatsQuery}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled || !body?.quote) return
        setSelection((current) => current && ({
          ...current,
          planName: body.plan.name,
          total: body.quote.total,
          vatRate: body.quote.vatRate,
          periodStartLabel: body.quote.periodStartLabel,
          periodEndLabel: body.quote.periodEndLabel,
        }))
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [selection?.interval, selection?.planKey, selection?.seats])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(''); setLoading(true)
    try {
      const response = await fetch('/api/trial-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName,
          contactName,
          contactEmail,
          industry,
          plan: selection?.planKey,
          billingInterval: selection?.interval,
          seats: selection?.seats,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(body.error ?? 'Unable to submit your request right now. Please try again.')
        return
      }
      setSubmitted(true)
    } catch {
      setError('Unable to submit your request right now. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f7f3] px-5 py-8 text-[#17211b] lg:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl"><Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#526158] hover:text-[#173b2b]"><ArrowLeft className="h-4 w-4" /> Back to Natural Intellects</Link><div className="mt-12 grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-start"><div><div className="flex items-center gap-3"><img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Natural%20Intellects%20LTD%20LOGO-kW8y0UnJCLLYKZinLc70NoJI9YPSup.png" alt="Natural Intellects Ltd" className="h-12 w-12 rounded-full object-cover" /><span className="sr-only">Natural Intellects Ltd</span></div><p className="mt-12 text-xs font-bold uppercase tracking-[0.22em] text-[#b2761b]">Start your trial</p><h1 className="mt-4 text-5xl font-semibold leading-[1.02] tracking-[-0.055em] text-[#173b2b]">A clearer workday starts here.</h1><p className="mt-6 max-w-md leading-7 text-[#65746a]">Create your organization workspace and explore the platform for 14 days. No payment details are required to begin.</p><div className="mt-8 space-y-4 text-sm text-[#526158]">{['A dedicated organization workspace', 'Configurable employee and reporting limits', 'Structured reports and management insight'].map((item) => <p key={item} className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-[#b2761b]" />{item}</p>)}</div></div><section className="rounded-3xl border border-[#dfe5dc] bg-white p-6 shadow-xl shadow-[#173b2b]/5 sm:p-9"><div className="mb-8"><h2 className="text-2xl font-semibold text-[#173b2b]">Create your organization</h2><p className="mt-2 text-sm leading-6 text-[#65746a]">We will use these details to prepare your workspace.</p></div>{submitted ? <div className="rounded-2xl bg-[#e8eee5] p-6"><CheckCircle2 className="h-7 w-7 text-[#356247]" /><h3 className="mt-5 text-xl font-semibold text-[#173b2b]">Your request is in.</h3><p className="mt-3 text-sm leading-6 text-[#526158]">Our team reviews new requests within one business day. Once your workspace is ready, you will receive sign-in details for <span className="font-semibold text-[#173b2b]">{contactEmail}</span> together with a temporary password.</p><Link href="/" className="mt-6 inline-flex items-center text-sm font-semibold text-[#173b2b]">Return to overview <ArrowRight className="ml-2 h-4 w-4" /></Link></div> : <form className="space-y-5" onSubmit={handleSubmit}>{error && <div role="alert" className="flex gap-3 rounded-xl border border-[#c0564a]/30 bg-[#c0564a]/10 p-3 text-sm text-[#8f2f26]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>{error}</p></div>}{selection && !submitted && (
  <aside className="mb-6 rounded-2xl border border-[#c47b32]/40 bg-[#fbf0dc] p-5" aria-label="Selected plan">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="text-sm font-bold text-[#173b2b]">{selection.planName} · {selection.intervalLabel} billing{selection.seats ? ` · ${selection.seats} seat${selection.seats === 1 ? '' : 's'}` : ''}</p>
      {selection.total !== null && <p className="text-lg font-semibold text-[#173b2b]">UGX {selection.total.toLocaleString('en-US')}</p>}
    </div>
    {selection.total !== null ? (
      <p className="mt-1.5 text-xs leading-5 text-[#6b5a34]">Your definitive rate after the trial, VAT inclusive — covers {selection.periodStartLabel} → {selection.periodEndLabel} from conversion. The 14-day trial itself is free.</p>
    ) : (
      <p className="mt-1.5 text-xs text-[#6b5a34]">Confirming your quote…</p>
    )}
  </aside>
)}
<div><label htmlFor="organization" className="mb-2 block text-sm font-semibold text-[#304237]">Organization name</label><input required id="organization" name="organization" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} maxLength={120} className="w-full rounded-xl border border-[#cbd6cb] bg-[#f7f7f3] px-4 py-3 text-sm outline-none transition focus:border-[#b2761b] focus:ring-2 focus:ring-[#b2761b]/20" placeholder="e.g. Acme Services" /></div><div className="grid gap-5 sm:grid-cols-2"><div><label htmlFor="name" className="mb-2 block text-sm font-semibold text-[#304237]">Your name</label><input required id="name" name="name" value={contactName} onChange={(event) => setContactName(event.target.value)} maxLength={120} autoComplete="name" className="w-full rounded-xl border border-[#cbd6cb] bg-[#f7f7f3] px-4 py-3 text-sm outline-none transition focus:border-[#b2761b] focus:ring-2 focus:ring-[#b2761b]/20" placeholder="Jane Doe" /></div><div><label htmlFor="email" className="mb-2 block text-sm font-semibold text-[#304237]">Work email</label><input required id="email" name="email" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} autoComplete="email" className="w-full rounded-xl border border-[#cbd6cb] bg-[#f7f7f3] px-4 py-3 text-sm outline-none transition focus:border-[#b2761b] focus:ring-2 focus:ring-[#b2761b]/20" placeholder="you@company.com" /></div></div><div><label htmlFor="industry" className="mb-2 block text-sm font-semibold text-[#304237]">Industry</label><select required id="industry" name="industry" value={industry} onChange={(event) => setIndustry(event.target.value)} className="w-full rounded-xl border border-[#cbd6cb] bg-[#f7f7f3] px-4 py-3 text-sm outline-none focus:border-[#b2761b] focus:ring-2 focus:ring-[#b2761b]/20"><option value="">Select an industry</option>{INDUSTRIES.map((option) => <option key={option} value={option}>{option}</option>)}</select></div><button type="submit" disabled={loading} className="flex w-full items-center justify-center rounded-xl bg-[#173b2b] px-5 py-3.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0">{loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <>Create organization workspace <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></>}</button><p className="text-center text-xs leading-5 text-[#829086]">By continuing, you agree to use the trial for your organization and to our responsible data handling practices.</p></form>}</section></div></div>
    </main>
  )
}
