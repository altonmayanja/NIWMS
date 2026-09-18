'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Building2, Users, FileText, CreditCard, ShieldAlert, ArrowLeft, RefreshCw, Search, CalendarClock } from 'lucide-react'

type Overview = { metrics: Record<string, number>; organizations: { id: string; name: string; slug: string; status: string; createdAt: string; trialEndsAt: string | null; subscription: { status: string; plan: { name: string } } | null; _count: { users: number } }[] }

// NI product palette — dark control-plane variant (green-tinted, gold accents)
const T = {
  page: 'bg-[#0f1a17] text-[#f4f1e8]',
  surface: 'bg-[#152520] border-[#2a4237]',
  border: 'border-[#2a4237]',
  muted: 'text-[#a8b8b0]',
  faint: 'text-[#7f948a]',
  brand: 'text-[#e9b44c]',
  positive: 'text-[#7fc9a6]',
}

function LifecycleBadge({ status }: { status: string }) {
  const normalized = (status || '').toLowerCase()
  const styles: Record<string, string> = {
    trial: 'bg-[#e9b44c]/10 text-[#e9b44c] border-[#e9b44c]/30',
    active: 'bg-[#7fc9a6]/10 text-[#7fc9a6] border-[#7fc9a6]/30',
    past_due: 'bg-[#e9b44c]/10 text-[#e9b44c] border-[#e9b44c]/30',
    grace_period: 'bg-[#e9b44c]/10 text-[#e9b44c] border-[#e9b44c]/30',
    suspended: 'bg-[#e2705f]/10 text-[#e2705f] border-[#e2705f]/30',
  }
  const cls = styles[normalized] ?? 'bg-white/5 text-[#a8b8b0] border-white/15'
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}>{normalized.replace(/_/g, ' ') || 'unknown'}</span>
}

export default function PlatformPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  async function load() {
    setLoading(true)
    const response = await fetch('/api/platform/overview', { credentials: 'include' })
    if (!response.ok) { setError(response.status === 403 ? 'This area is restricted to Natural Intellects platform administrators.' : 'Sign in with a platform administrator account to continue.'); setLoading(false); return }
    setData(await response.json()); setError(''); setLoading(false)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const organizations = data?.organizations ?? []
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return organizations
    return organizations.filter((o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q))
  }, [organizations, query])

  const trialCount = organizations.filter((o) => (o.status || '').toLowerCase() === 'trial').length

  if (loading) {
    return (
      <main className={`min-h-screen ${T.page} p-6 sm:p-10`}>
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="h-24 animate-pulse rounded-xl bg-[#152520]/70" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-36 animate-pulse rounded-xl bg-[#152520]/70" />)}
          </div>
          <div className="h-64 animate-pulse rounded-xl bg-[#152520]/70" />
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className={`flex min-h-screen items-center justify-center ${T.page} p-6`}>
        <div className={`max-w-md rounded-xl border ${T.surface} p-8`}>
          <ShieldAlert className="mb-5 h-7 w-7 text-[#e9b44c]" />
          <h1 className="text-2xl font-semibold">Access restricted</h1>
          <p className="mt-3 text-sm leading-6 text-[#a8b8b0]">{error}</p>
          <Link href="/login" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#e9b44c] hover:underline">Go to login <ArrowLeft className="h-4 w-4" /></Link>
        </div>
      </main>
    )
  }

  const cards = [
    { label: 'Organizations', value: data?.metrics.organizations, icon: Building2, accent: 'text-[#e9b44c] bg-[#e9b44c]/10' },
    { label: 'Active employees', value: data?.metrics.employees, icon: Users, accent: 'text-[#7fc9a6] bg-[#7fc9a6]/10' },
    { label: 'Organizations on trial', value: trialCount, icon: CreditCard, accent: 'text-[#e9b44c] bg-[#e9b44c]/10' },
    { label: 'Reports generated', value: data?.metrics.reports, icon: FileText, accent: 'text-[#7fc9a6] bg-[#7fc9a6]/10' },
  ]

  return (
    <main className={`min-h-screen ${T.page}`}>
      <header className={`sticky top-0 z-10 border-b ${T.border} bg-[#12211d]/95 backdrop-blur`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e9b44c]">Natural Intellects</p>
            <h1 className="mt-1 text-xl font-semibold">Control Center</h1>
          </div>
          <button onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#3a5548] px-4 text-sm transition-colors hover:bg-[#1d332b]">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Metric cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ label, value, icon: Icon, accent }) => (
            <div key={label} className={`rounded-xl border ${T.surface} p-5 transition-colors hover:border-[#3a5548]`}>
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-6 text-3xl font-semibold tabular-nums">{value ?? 0}</p>
              <p className={`mt-2 text-sm ${T.muted}`}>{label}</p>
            </div>
          ))}
        </div>

        {/* Organizations */}
        <section className={`mt-10 overflow-hidden rounded-xl border ${T.surface}`}>
          <div className={`flex flex-col gap-4 border-b ${T.border} px-5 py-4 sm:flex-row sm:items-center sm:justify-between`}>
            <div>
              <h2 className="font-semibold">Organizations</h2>
              <p className={`mt-1 text-sm ${T.muted}`}>Control-plane visibility without unrestricted customer report access.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f948a]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search organizations..."
                  aria-label="Search organizations"
                  className="h-10 w-56 rounded-lg border border-[#3a5548] bg-[#0f1a17] pl-9 pr-3 text-sm text-[#f4f1e8] placeholder:text-[#5f7269] focus:border-[#e9b44c]/60 focus:outline-none"
                />
              </div>
              <span className="hidden text-xs uppercase tracking-widest text-[#7fc9a6] sm:inline">Live data</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className={`text-xs uppercase tracking-wider ${T.faint}`}>
                <tr className={`border-b ${T.border}`}>
                  <th className="px-5 py-4">Organization</th>
                  <th className="px-5 py-4">Plan</th>
                  <th className="px-5 py-4">Users</th>
                  <th className="px-5 py-4">Lifecycle</th>
                  <th className="px-5 py-4">Trial ends</th>
                  <th className="px-5 py-4">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((organization) => (
                  <tr key={organization.id} className={`border-b border-[#21362e] transition-colors last:border-0 hover:bg-[#1b2e27]`}>
                    <td className="px-5 py-4">
                      <p className="font-medium">{organization.name}</p>
                      <p className={`text-xs ${T.faint}`}>{organization.slug}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-xs text-[#d8e2dc]">
                        {organization.subscription?.plan.name ?? 'Unassigned'}
                      </span>
                    </td>
                    <td className="px-5 py-4 tabular-nums">{organization._count.users}</td>
                    <td className="px-5 py-4"><LifecycleBadge status={organization.subscription?.status ?? organization.status} /></td>
                    <td className={`px-5 py-4 tabular-nums ${T.muted}`}>
                      {organization.trialEndsAt ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarClock className={`h-3.5 w-3.5 ${T.faint}`} />
                          {new Date(organization.trialEndsAt).toLocaleDateString()}
                        </span>
                      ) : '—'}
                    </td>
                    <td className={`px-5 py-4 tabular-nums ${T.muted}`}>{new Date(organization.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className={`p-8 text-sm ${T.muted}`}>
                {organizations.length === 0 ? 'No organizations have been created yet.' : `No organizations match “${query}”.`}
              </p>
            )}
          </div>
        </section>

        <p className={`mt-8 text-center text-xs ${T.faint}`}>© {new Date().getFullYear()} Natural Intellects Ltd · NIWMS Control Center</p>
      </div>
    </main>
  )
}
