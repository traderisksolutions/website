'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Tip } from '@/components/Tip'
import { Button } from '@/components/ui/button'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { cn } from '@/lib/utils'
import { StatCard } from '@/components/stat-card'
import { Chip, inputCls } from '@/components/crm/primitives'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'search' | 'companies' | 'people' | 'emails'

interface SearchRun {
  id: string; sector: string; location: string; locations: string[]
  headcount_ranges: string[]; product_type: string
  roles_targeted: string[]; cron_preference: string | null
  company_count: number; status: string; created_at: string
}
interface Company {
  id: string; search_id: string; name: string; source_rank: number
  employee_count: number | null; industry: string | null
  people_fetched: boolean; people_count: number; created_at: string
}
interface Person {
  id: string; search_id: string; company_id: string; company_name: string
  first_name: string | null; last_name: string | null; full_name: string | null
  title: string | null; headline: string | null; linkedin_url: string | null
  profile_picture: string | null; location: string | null
  email_requested: boolean; email: string | null; email_status: string | null
  outbound_lead_id: string | null
}
interface EmailResult {
  id: string; email: string | null; email_status: string; outbound_lead_id: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LOCATIONS = ['Singapore', 'Hong Kong', 'Malaysia', 'Indonesia']
const HEADCOUNT_OPTIONS = [
  { value: '1-10',     label: '1–10' },
  { value: '10-50',    label: '10–50' },
  { value: '50-200',   label: '50–200' },
  { value: '200-1000', label: '200–1,000' },
  { value: '1000+',    label: '1,000+' },
]
const CRON_OPTIONS = [
  { value: 'none',   label: 'None (run once)' },
  { value: 'weekly', label: 'Weekly' },
]
const PEOPLE_PAGE_SIZE = 30

// ── Shared sub-components ─────────────────────────────────────────────────────

function FormLabel({ children }: { children: React.ReactNode }) {
  return <span className="flex items-center gap-1 text-[12.5px] mb-1.5" style={{ color: MUTED }}>{children}</span>
}

function SectionCard({ title, aside, children, className }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-[16px] bg-white px-6 py-5', className)} style={{ border: `1px solid ${RULE}` }}>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="m-0 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>{title}</h2>
        {aside}
      </div>
      {children}
    </div>
  )
}

const PageTitle = ({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) => (
  <div className="flex-1 min-w-0">
    <p className="m-0 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>{children}</p>
    {sub && <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: MUTED }}>{sub}</p>}
  </div>
)

// ── Multi-select chip component ───────────────────────────────────────────────

function ChipSelect({ options, selected, onChange, label }: {
  options: { value: string; label: string }[]; selected: string[]
  onChange: (v: string[]) => void; label: string
}) {
  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value])
  }
  return (
    <div>
      <FormLabel>{label}</FormLabel>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const active = selected.includes(o.value)
          return (
            <button key={o.value} type="button" onClick={() => toggle(o.value)} aria-pressed={active}
              className="h-8 px-3 rounded-[8px] text-[13px] font-medium cursor-pointer border-0 transition-colors"
              style={{ background: active ? INK : '#f1f3f4', color: active ? '#ffffff' : '#3c4043' }}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Step switch ───────────────────────────────────────────────────────────────

function StepTabs({ step, onNav, canGo }: {
  step: Step; onNav: (s: Step) => void; canGo: Record<Step, boolean>
}) {
  const steps: { key: Step; label: string }[] = [
    { key: 'search',    label: 'Search' },
    { key: 'companies', label: 'Companies' },
    { key: 'people',    label: 'People' },
    { key: 'emails',    label: 'Emails' },
  ]
  return (
    <div className="mt-8 flex items-center gap-6 overflow-x-auto" role="tablist" aria-label="Discovery steps" style={{ borderBottom: `1px solid ${RULE}` }}>
      {steps.map((s, i) => {
        const on = step === s.key
        const enabled = canGo[s.key]
        return (
          <button key={s.key} type="button" role="tab" aria-selected={on} aria-disabled={!enabled} onClick={() => enabled && onNav(s.key)}
            className={cn('relative pb-3 bg-transparent border-0 text-[15px] whitespace-nowrap', on ? 'font-medium' : enabled ? 'cursor-pointer hover:text-[#202124]' : 'cursor-default')}
            style={{ color: on ? INK : enabled ? MUTED : '#9aa0a6' }}>
            <span className="mr-1.5 tabular-nums" style={{ color: '#9aa0a6' }}>{i + 1}</span>{s.label}
            <span className={cn('absolute left-0 right-0 -bottom-px h-[2px] rounded-full', on ? 'block' : 'hidden')} style={{ background: INK }} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OutboundAgentPage() {
  const [step,          setStep]          = useState<Step>('search')
  const [history,       setHistory]       = useState<SearchRun[]>([])
  const [isHistory,     setIsHistory]     = useState(false)
  const [currentSearch, setCurrentSearch] = useState<SearchRun | null>(null)
  const [companies,     setCompanies]     = useState<Company[]>([])
  const [people,        setPeople]        = useState<Person[]>([])
  const [emailResults,  setEmailResults]  = useState<EmailResult[]>([])

  const [selCompanies, setSelCompanies] = useState<Set<string>>(new Set())

  const [loading,          setLoading]          = useState(false)
  const [fetchingPeople,   setFetchingPeople]   = useState(false)
  const [fetchingEmailFor, setFetchingEmailFor] = useState<Set<string>>(new Set())
  const [error,            setError]            = useState<string | null>(null)
  const [skipped,          setSkipped]          = useState(0)
  const [peoplePage,       setPeoplePage]       = useState(1)

  // Form state
  const [sector,          setSector]          = useState('')
  const [locations,       setLocations]       = useState<string[]>(['Singapore'])
  const [headcountRanges, setHeadcountRanges] = useState<string[]>([])
  const [cronPref,        setCronPref]        = useState('none')
  const [perPage,         setPerPage]         = useState(10)

  const loadHistory = useCallback(async () => {
    const res  = await fetch('/api/outbound/history')
    const data = await res.json()
    setHistory(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  useEffect(() => {
    if (!currentSearch) return
    sessionStorage.setItem('ob_agent_session', JSON.stringify({ search: currentSearch, step }))
  }, [currentSearch, step])

  useEffect(() => {
    const raw = sessionStorage.getItem('ob_agent_session')
    if (!raw) return
    try {
      const { search, step: savedStep } = JSON.parse(raw) as { search: SearchRun; step: Step }
      if (!search?.id) return
      setCurrentSearch(search); setLoading(true)
      fetch(`/api/outbound/history?id=${search.id}`)
        .then(r => r.json())
        .then(data => {
          const restoredCompanies: Company[] = Array.isArray(data.companies) ? data.companies : []
          const restoredPeople:   Person[]   = Array.isArray(data.people)    ? data.people    : []
          setCompanies(restoredCompanies); setPeople(restoredPeople)
          const alreadyEmailed = restoredPeople.filter(p => p.email_requested)
          if (alreadyEmailed.length > 0) {
            setEmailResults(alreadyEmailed.map(p => ({
              id: p.id, email: p.email, email_status: p.email_status ?? 'unknown',
              outbound_lead_id: p.outbound_lead_id,
            })))
          }
          if (savedStep === 'emails' && alreadyEmailed.length > 0) setStep('emails')
          else if (savedStep === 'people' && restoredPeople.length > 0) setStep('people')
          else if (restoredCompanies.length > 0) setStep('companies')
        })
        .finally(() => setLoading(false))
    } catch { /* ignore */ }
  }, [])

  const canGo: Record<Step, boolean> = {
    search:    true,
    companies: !!currentSearch,
    people:    !!currentSearch && people.length > 0,
    emails:    people.some(p => p.email_requested),
  }

  async function runSearch() {
    if (!sector.trim() || locations.length === 0) {
      setError('Fill in sector and at least one location.')
      return
    }
    setError(null); setLoading(true); setIsHistory(false)
    setCompanies([]); setPeople([]); setEmailResults([])
    setSelCompanies(new Set())
    sessionStorage.removeItem('ob_agent_session')
    try {
      const res  = await fetch('/api/outbound/apollo-search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sector: sector.trim(), locations, headcountRanges,
          productType: 'General',
          cronPreference: cronPref === 'none' ? null : cronPref,
          perPage,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      setCurrentSearch({
        id: data.searchId, sector: sector.trim(), location: locations[0], locations,
        headcount_ranges: headcountRanges, product_type: 'General', roles_targeted: [],
        cron_preference: cronPref === 'none' ? null : cronPref,
        company_count: data.companies.length, status: 'completed', created_at: new Date().toISOString(),
      })
      setCompanies(data.companies)
      setSkipped(data.skipped ?? 0)
      const notEnriched = data.notEnriched ?? 0
      if (notEnriched > 0) {
        setError(`${notEnriched} companies suggested by AI could not be verified in Apollo — they were skipped.`)
      }
      setStep('companies')
      loadHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally { setLoading(false) }
  }

  async function viewHistorySearch(s: SearchRun) {
    setLoading(true); setIsHistory(true); setCurrentSearch(s)
    setEmailResults([]); setSelCompanies(new Set())
    try {
      const res  = await fetch(`/api/outbound/history?id=${s.id}`)
      const data = await res.json()
      setCompanies(Array.isArray(data.companies) ? data.companies : [])
      setPeople(Array.isArray(data.people) ? data.people : [])
      setStep('companies')
    } catch { setError('Failed to load history') }
    finally  { setLoading(false) }
  }

  async function fetchPeople() {
    if (!currentSearch || selCompanies.size === 0) return
    setFetchingPeople(true); setError(null)
    try {
      const res  = await fetch('/api/outbound/apollo-people', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchId: currentSearch.id, companyIds: Array.from(selCompanies) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'People fetch failed')
      const people: Record<string, unknown>[] = Array.isArray(data.people) ? data.people : []
      const warnings: string[] = Array.isArray(data.warnings) ? data.warnings : []
      setPeople(people as unknown as Person[])
      if (people.length > 0) {
        setCompanies(prev => prev.map(c => selCompanies.has(c.id) ? { ...c, people_fetched: true } : c))
      }
      if (warnings.length > 0) {
        setError(warnings.join(' · '))
      }
      setSelCompanies(new Set()); setPeoplePage(1); setStep('people')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'People fetch failed')
    } finally { setFetchingPeople(false) }
  }

  async function fetchEmailForPerson(personId: string) {
    setFetchingEmailFor(prev => { const n = new Set(prev); n.add(personId); return n })
    setError(null)
    try {
      const res  = await fetch('/api/outbound/apollo-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personIds: [personId] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Email lookup failed')
      const results: EmailResult[] = Array.isArray(data.results) ? data.results : []
      setEmailResults(prev => [...prev, ...results.filter(r => !prev.find(e => e.id === r.id))])
      const map = new Map(results.map(r => [r.id, r]))
      setPeople(prev => prev.map(p => {
        const r = map.get(p.id)
        return r ? { ...p, email: r.email, email_status: r.email_status, email_requested: true, outbound_lead_id: r.outbound_lead_id } : p
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Email lookup failed')
    } finally {
      setFetchingEmailFor(prev => { const n = new Set(prev); n.delete(personId); return n })
    }
  }

  const totalPages  = Math.ceil(people.length / PEOPLE_PAGE_SIZE)
  const pagedPeople = people.slice((peoplePage - 1) * PEOPLE_PAGE_SIZE, peoplePage * PEOPLE_PAGE_SIZE)

  const emailsFound    = people.filter(p => p.email).length
  const emailsNotFound = people.filter(p => p.email_requested && !p.email).length

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">

        {/* Header */}
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Lead discovery</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>Companies from Gemini, decision-makers and verified emails from Apollo.</p>
          </div>
        </div>

        <StepTabs step={step} onNav={setStep} canGo={canGo} />

        {error && (
          <p className="mt-6 mb-0 text-[14px] flex items-center gap-3 flex-wrap" style={{ color: '#3c4043' }} role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>Dismiss</button>
          </p>
        )}

        {/* ══ STEP 1: SEARCH ══ */}
        {step === 'search' && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-5 items-start">

            <SectionCard title="New search">
              <div className="flex flex-col gap-4">
                <label className="block">
                  <FormLabel>Industry or sector</FormLabel>
                  <input className={inputCls} placeholder="SaaS, FinTech, Logistics, Marine"
                    value={sector} onChange={e => setSector(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && runSearch()} />
                </label>
                <ChipSelect label="Locations" options={LOCATIONS.map(l => ({ value: l, label: l }))} selected={locations} onChange={setLocations} />
                <ChipSelect label="Company headcount (optional)" options={HEADCOUNT_OPTIONS} selected={headcountRanges} onChange={setHeadcountRanges} />
                <label className="block">
                  <FormLabel>
                    Scheduled run
                    <Tip placement="right" text="How often the AI re-runs this search with the same criteria and adds new companies to the lead database." />
                  </FormLabel>
                  <select value={cronPref} onChange={e => setCronPref(e.target.value)} className={inputCls}>
                    {CRON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <FormLabel>
                    Number of results
                    <Tip placement="right" text="How many companies Apollo returns per search. The Apollo free plan has 75 credits a month; keep this low and run fewer searches." />
                  </FormLabel>
                  <input
                    type="number" min={1} max={100} value={perPage}
                    onChange={e => setPerPage(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                    className={inputCls}
                  />
                  <span className="block mt-1.5 text-[12.5px]" style={{ color: MUTED }}>
                    Gemini discovers companies; Apollo verifies each (about {perPage} credits of 75 a month).
                  </span>
                </label>
              </div>
              <Button className="mt-5 w-full" onClick={runSearch} disabled={loading || !sector.trim() || locations.length === 0}>
                {loading ? 'Finding companies…' : 'Find companies'}
              </Button>
            </SectionCard>

            <section className="min-w-0">
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <h2 className="m-0 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Search history</h2>
                <span className="text-[12.5px]" style={{ color: MUTED }}>Last 30 days</span>
              </div>
              <Register label="Search history" minWidth={560}>
                <RegisterHead>
                  <RegisterTh first>Sector</RegisterTh>
                  <RegisterTh>Type</RegisterTh>
                  <RegisterTh align="right">Companies</RegisterTh>
                  <RegisterTh align="right">Run</RegisterTh>
                  <RegisterTh last />
                </RegisterHead>
                <tbody>
                  {history.length === 0 && <RegisterEmpty colSpan={5}>No searches yet.</RegisterEmpty>}
                  {history.map(s => (
                    <RegisterRow key={s.id} onClick={() => viewHistorySearch(s)}>
                      <RegisterCell first primary={s.sector} secondary={(s.locations?.length ? s.locations : [s.location]).join(', ')} title={s.sector} />
                      <RegisterCell><Chip>{s.product_type ?? 'General'}</Chip></RegisterCell>
                      <RegisterCell align="right" primary={s.company_count} />
                      <RegisterCell align="right" primary={new Date(s.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: '2-digit' })} />
                      <RegisterCell last align="right">
                        <Button variant="outline" size="xs" onClick={e => { e.stopPropagation(); viewHistorySearch(s) }}>View</Button>
                      </RegisterCell>
                    </RegisterRow>
                  ))}
                </tbody>
              </Register>
            </section>
          </div>
        )}

        {/* ══ STEP 2: COMPANIES ══ */}
        {step === 'companies' && currentSearch && (
          <div className="mt-6">
            <div className="flex items-center gap-4 mb-6 flex-wrap">
              <Button variant="ghost" size="sm" onClick={() => setStep('search')}>← Search</Button>
              <PageTitle sub={skipped > 0 ? `${skipped} duplicate${skipped === 1 ? '' : 's'} excluded` : undefined}>
                {currentSearch.sector} <span className="font-normal" style={{ color: MUTED }}>· {(currentSearch.locations ?? [currentSearch.location]).join(', ')}</span>
              </PageTitle>
              {isHistory
                ? <span className="text-[12.5px]" style={{ color: MUTED }}>Read-only history</span>
                : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] tabular-nums" style={{ color: MUTED }}>{selCompanies.size} selected</span>
                    <Tip text="Looks up decision-makers (risk managers, CFOs, operations leads) at the selected companies through Apollo. Tick the companies first." />
                    <Button onClick={fetchPeople} disabled={selCompanies.size === 0 || fetchingPeople}>
                      {fetchingPeople ? 'Fetching…' : `Fetch people (${selCompanies.size})`}
                    </Button>
                  </div>
                )
              }
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <StatCard label="Companies found" value={companies.length} />
              <StatCard label="People fetched" value={companies.filter(c => c.people_fetched).length} sublabel={`of ${companies.length}`} />
              <StatCard label="Total people" value={companies.reduce((n, c) => n + c.people_count, 0)} />
            </div>

            <Register label="Companies found" minWidth={720}>
              <RegisterHead>
                <RegisterTh first>
                  <span className="inline-flex items-center gap-3">
                    {!isHistory && <input type="checkbox" aria-label="Select all companies" className="cursor-pointer" checked={selCompanies.size === companies.length && companies.length > 0} onChange={e => setSelCompanies(e.target.checked ? new Set(companies.map(c => c.id)) : new Set())} />}
                    Company
                  </span>
                </RegisterTh>
                <RegisterTh align="right">Headcount</RegisterTh>
                <RegisterTh>People</RegisterTh>
                <RegisterTh last align="right">Count</RegisterTh>
              </RegisterHead>
              <tbody>
                {companies.length === 0 && <RegisterEmpty colSpan={4}>No companies found.</RegisterEmpty>}
                {companies.map(c => {
                  const on = selCompanies.has(c.id)
                  const toggle = () => setSelCompanies(prev => { const n = new Set(prev); on ? n.delete(c.id) : n.add(c.id); return n })
                  return (
                    <RegisterRow key={c.id} selected={on} className="hover:bg-[#f8f9fa]">
                      <RegisterCell first selected={on} className="min-w-[280px]">
                        <span className="flex items-center gap-3 min-w-0">
                          {!isHistory && (
                            <input type="checkbox" aria-label={`Select ${c.name}`} className="cursor-pointer flex-shrink-0" checked={on} onChange={toggle} />
                          )}
                          <span className="text-[12.5px] tabular-nums flex-shrink-0 w-5" style={{ color: '#9aa0a6' }}>{c.source_rank}</span>
                          <span className="min-w-0">
                            <span className="block text-[15px] font-medium leading-tight truncate" style={{ color: INK }} title={c.name}>{c.name}</span>
                            <span className="block text-[12.5px] mt-0.5 truncate" style={{ color: MUTED }}>{c.industry ?? 'No industry on file'}</span>
                          </span>
                        </span>
                      </RegisterCell>
                      <RegisterCell align="right" primary={c.employee_count ? c.employee_count.toLocaleString() : '—'} />
                      <RegisterCell><Chip>{c.people_fetched ? 'Fetched' : 'Pending'}</Chip></RegisterCell>
                      <RegisterCell last align="right">
                        <span className="text-[14px] tabular-nums" style={{ color: c.people_count > 0 ? INK : '#9aa0a6' }}>{c.people_count > 0 ? c.people_count : '—'}</span>
                      </RegisterCell>
                    </RegisterRow>
                  )
                })}
              </tbody>
            </Register>

            {people.length > 0 && (
              <div className="mt-4 flex justify-end">
                <Button variant="outline" onClick={() => setStep('people')}>View {people.length} people →</Button>
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 3: PEOPLE ══ */}
        {step === 'people' && currentSearch && (
          <div className="mt-6">
            <div className="flex items-center gap-4 mb-6 flex-wrap">
              <Button variant="ghost" size="sm" onClick={() => setStep('companies')}>← Companies</Button>
              <PageTitle sub={`From ${new Set(people.map(p => p.company_id)).size} companies`}>
                {people.length} people <span className="font-normal" style={{ color: MUTED }}>· {currentSearch.sector}</span>
              </PageTitle>
              {isHistory && <span className="text-[12.5px]" style={{ color: MUTED }}>Read-only history</span>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <StatCard label="People found" value={people.length} />
              <StatCard label="From companies" value={new Set(people.map(p => p.company_id)).size} />
              <StatCard label="Emails found" value={emailsFound}
                sublabel={people.some(p => p.email_requested) ? `of ${people.filter(p => p.email_requested).length} requested` : undefined} />
            </div>

            <Register label="People found" minWidth={880}>
              <RegisterHead>
                <RegisterTh first>Name</RegisterTh>
                <RegisterTh>Company</RegisterTh>
                <RegisterTh>Location</RegisterTh>
                <RegisterTh>Email</RegisterTh>
                <RegisterTh last>LinkedIn</RegisterTh>
              </RegisterHead>
              <tbody>
                {pagedPeople.length === 0 && <RegisterEmpty colSpan={5}>No people yet.</RegisterEmpty>}
                {pagedPeople.map(p => (
                  <RegisterRow key={p.id} className="hover:bg-[#f8f9fa]">
                    <RegisterCell first primary={p.full_name || '—'} secondary={p.title || p.headline || 'No title on file'} title={p.full_name ?? undefined} />
                    <RegisterCell><span className="text-[14px]" style={{ color: '#3c4043' }}>{p.company_name}</span></RegisterCell>
                    <RegisterCell><span className="text-[14px]" style={{ color: MUTED }}>{p.location || '—'}</span></RegisterCell>
                    <RegisterCell>
                      {p.email
                        ? <span className="text-[14px]" style={{ color: INK }}>{p.email}</span>
                        : p.email_requested
                        ? <span className="text-[13px]" style={{ color: MUTED }}>Not found</span>
                        : fetchingEmailFor.has(p.id)
                        ? <Loader2 size={13} className="animate-spin" style={{ color: '#9aa0a6' }} />
                        : !isHistory
                        ? <Button variant="outline" size="xs" onClick={() => fetchEmailForPerson(p.id)}>Get email</Button>
                        : <span style={{ color: '#9aa0a6' }}>—</span>
                      }
                    </RegisterCell>
                    <RegisterCell last>
                      {p.linkedin_url
                        ? <a href={p.linkedin_url} target="_blank" rel="noreferrer" className="text-[13.5px] no-underline hover:underline underline-offset-4" style={{ color: INK }}>Profile ↗</a>
                        : <span style={{ color: '#9aa0a6' }}>—</span>
                      }
                    </RegisterCell>
                  </RegisterRow>
                ))}
              </tbody>
            </Register>

            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                <span className="text-[13px] tabular-nums" style={{ color: MUTED }}>
                  {(peoplePage - 1) * PEOPLE_PAGE_SIZE + 1}–{Math.min(peoplePage * PEOPLE_PAGE_SIZE, people.length)} of {people.length}
                </span>
                <div className="flex gap-1 flex-wrap">
                  <Button variant="outline" size="xs" onClick={() => setPeoplePage(p => Math.max(1, p - 1))} disabled={peoplePage === 1}>← Previous</Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                    <Button key={n} variant={n === peoplePage ? 'secondary' : 'outline'} size="xs" className="w-7 px-0 tabular-nums" onClick={() => setPeoplePage(n)} aria-current={n === peoplePage ? 'page' : undefined}>{n}</Button>
                  ))}
                  <Button variant="outline" size="xs" onClick={() => setPeoplePage(p => Math.min(totalPages, p + 1))} disabled={peoplePage === totalPages}>Next →</Button>
                </div>
              </div>
            )}

            {people.some(p => p.email_requested) && (
              <div className="mt-4 flex justify-end">
                <Button onClick={() => setStep('emails')}>View email results →</Button>
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 4: EMAILS ══ */}
        {step === 'emails' && (
          <div className="mt-6">
            <div className="flex items-center gap-4 mb-6 flex-wrap">
              <Button variant="ghost" size="sm" onClick={() => setStep('people')}>← People</Button>
              <PageTitle sub={`${emailsFound} found · ${emailsNotFound} not found`}>Email results</PageTitle>
              <Link href="/outbound/leads" className="inline-flex items-center h-10 px-4 rounded-[10px] text-white text-[14px] font-medium no-underline hover:opacity-90" style={{ background: INK }}>
                Open lead database
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <StatCard label="Emails found" value={emailsFound} />
              <StatCard label="Not found" value={emailsNotFound} />
            </div>

            <Register label="Email results" minWidth={800}>
              <RegisterHead>
                <RegisterTh first>Name</RegisterTh>
                <RegisterTh>Email</RegisterTh>
                <RegisterTh>Status</RegisterTh>
                <RegisterTh>Company</RegisterTh>
                <RegisterTh last>Saved</RegisterTh>
              </RegisterHead>
              <tbody>
                {!people.some(p => p.email_requested) && <RegisterEmpty colSpan={5}>No email lookups yet.</RegisterEmpty>}
                {people.filter(p => p.email_requested).map(p => (
                  <RegisterRow key={p.id} className="hover:bg-[#f8f9fa]">
                    <RegisterCell first primary={p.full_name || '—'} secondary={p.title || p.headline || 'No title on file'} title={p.full_name ?? undefined} />
                    <RegisterCell><span className="text-[14px]" style={{ color: p.email ? INK : MUTED }}>{p.email || 'Not found'}</span></RegisterCell>
                    <RegisterCell><Chip>{(p.email_status ?? (p.email ? 'valid' : 'not_found')).replace(/_/g, ' ').replace(/^\w/, ch => ch.toUpperCase())}</Chip></RegisterCell>
                    <RegisterCell><span className="text-[14px]" style={{ color: '#3c4043' }}>{p.company_name}</span></RegisterCell>
                    <RegisterCell last><span className="text-[14px]" style={{ color: p.outbound_lead_id ? INK : '#9aa0a6' }}>{p.outbound_lead_id ? 'Saved' : '—'}</span></RegisterCell>
                  </RegisterRow>
                ))}
              </tbody>
            </Register>
          </div>
        )}
      </div>
    </div>
  )
}
