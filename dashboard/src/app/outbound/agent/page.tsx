'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Search, Building2, Users, Mail, ChevronRight,
  Clock, ArrowLeft, AlertCircle, CheckCircle, ExternalLink, Loader2,
} from 'lucide-react'
import { Tip } from '@/components/Tip'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { AppScrollPage } from '@/components/app-shell'
import { PageHeader } from '@/components/page-header'

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
  { value: '<50',      label: '< 50' },
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
  return <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">{children}</span>
}

function TBadge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded whitespace-nowrap" style={{ color, background: bg }}>
      {label}
    </span>
  )
}

function Th({ children, w }: { children?: React.ReactNode; w?: number }) {
  return (
    <th className="h-9 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 whitespace-nowrap" style={{ width: w }}>
      {children}
    </th>
  )
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={cn('px-3 py-2.5 align-middle border-b border-[--border-subtle] text-[13px]', className)}>
      {children}
    </td>
  )
}

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
            <button key={o.value} type="button" onClick={() => toggle(o.value)}
              className={cn(
                'px-3 py-1 rounded-[6px] text-[12px] font-medium cursor-pointer transition-all',
                active ? 'bg-foreground text-background' : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────

function Breadcrumb({ step, onNav, canGo }: {
  step: Step; onNav: (s: Step) => void; canGo: Record<Step, boolean>
}) {
  const steps: { key: Step; label: string; icon: React.ReactNode }[] = [
    { key: 'search',    label: 'Search',    icon: <Search    size={11} /> },
    { key: 'companies', label: 'Companies', icon: <Building2 size={11} /> },
    { key: 'people',    label: 'People',    icon: <Users     size={11} /> },
    { key: 'emails',    label: 'Emails',    icon: <Mail      size={11} /> },
  ]
  return (
    <div className="flex items-center gap-0.5 mb-6">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center">
          {i > 0 && <ChevronRight size={12} className="text-border mx-0.5" />}
          <button onClick={() => canGo[s.key] && onNav(s.key)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-md border-0 text-[12px] transition-all',
              step === s.key ? 'bg-foreground text-background font-semibold' : canGo[s.key] ? 'bg-muted text-muted-foreground font-normal cursor-pointer hover:bg-muted/80' : 'bg-transparent text-muted-foreground/30 cursor-default font-normal'
            )}
          >
            {s.icon} {s.label}
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OutboundAgentPage() {
  const [step,      setStep]      = useState<Step>('search')
  const [isHistory, setIsHistory] = useState(false)

  const [history,       setHistory]       = useState<SearchRun[]>([])
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

  return (
    <AppScrollPage maxWidth="1140px">

      <PageHeader
        title="Lead Discovery"
        description="AI finds real companies in any sector → Apollo finds decision-makers → verified emails"
        className="mb-6"
      />

      <Breadcrumb step={step} onNav={setStep} canGo={canGo} />

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 mb-4 rounded-lg bg-destructive/8 border border-destructive/20 text-[13px] text-destructive">
          <AlertCircle size={14} className="flex-shrink-0" strokeWidth={2} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="bg-transparent border-0 cursor-pointer text-destructive text-base leading-none">×</button>
        </div>
      )}

      {/* ══ STEP 1: SEARCH ══ */}
      {step === 'search' && (
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-5 items-start">

          <Card>
            <CardContent className="p-6">
              <p className="text-[15px] font-bold text-foreground mb-4">New Search</p>
              <div className="flex flex-col gap-3.5">
                <div>
                  <FormLabel>Industry / Sector *</FormLabel>
                  <Input placeholder="e.g. SaaS, FinTech, Logistics, Marine"
                    value={sector} onChange={e => setSector(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && runSearch()} />
                </div>
                <ChipSelect label="Location * (select all that apply)" options={LOCATIONS.map(l => ({ value: l, label: l }))} selected={locations} onChange={setLocations} />
                <ChipSelect label="Company Headcount (optional)" options={HEADCOUNT_OPTIONS} selected={headcountRanges} onChange={setHeadcountRanges} />
                <div>
                  <FormLabel>
                    Scheduled Run{' '}
                    <Tip placement="right" text="Set how often the AI automatically re-runs this search with the same criteria and adds new companies to the Lead Database." />
                  </FormLabel>
                  <select value={cronPref} onChange={e => setCronPref(e.target.value)}
                    className="w-full h-9 px-3 text-[13px] text-foreground bg-background border border-input rounded-md outline-none focus:ring-1 focus:ring-ring">
                    {CRON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <FormLabel>
                    Number of results{' '}
                    <Tip placement="right" text="How many companies Apollo returns per search. Apollo free plan: 75 credits/month total — keep this low and run fewer searches." />
                  </FormLabel>
                  <input
                    type="number" min={1} max={100} value={perPage}
                    onChange={e => setPerPage(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-full h-9 px-3 text-[13px] text-foreground bg-background border border-input rounded-md outline-none focus:ring-1 focus:ring-ring"
                  />
                  <p className="text-[11px] mt-1 text-amber-600">
                    Gemini discovers companies · Apollo verifies each (~{perPage} credits) · 75 credits/month free
                  </p>
                </div>
              </div>
              <Button className="mt-5 w-full gap-1.5" onClick={runSearch}
                disabled={loading || !sector.trim() || locations.length === 0}>
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                {loading ? 'AI is finding companies…' : 'Find Companies'}
              </Button>
            </CardContent>
          </Card>

          {/* History card */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Clock size={13} className="text-muted-foreground" />
                <p className="text-[15px] font-bold text-foreground m-0">Search History</p>
                <span className="ml-auto text-[11px] text-muted-foreground/50">Last 30 days</span>
              </div>
              {history.length === 0 ? (
                <p className="text-[13px] text-muted-foreground/40 text-center py-6">No searches yet</p>
              ) : (
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr>
                      {['Date', 'Sector', 'Locations', 'Type', 'Companies', ''].map(h => <Th key={h}>{h}</Th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(s => (
                      <tr key={s.id} className="hover:bg-muted/50 transition-colors">
                        <Td className="text-muted-foreground whitespace-nowrap">
                          {new Date(s.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </Td>
                        <Td className="font-medium text-foreground max-w-[130px] overflow-hidden text-ellipsis whitespace-nowrap">{s.sector}</Td>
                        <Td className="text-muted-foreground text-[11px]">{(s.locations?.length ? s.locations : [s.location]).join(', ')}</Td>
                        <Td>
                          <TBadge label={s.product_type ?? 'General'} color="hsl(var(--muted-foreground))" bg="hsl(var(--muted))" />
                        </Td>
                        <Td className="font-semibold text-foreground">{s.company_count}</Td>
                        <Td>
                          <Button variant="outline" size="sm" className="text-[11px] h-7 px-2.5" onClick={() => viewHistorySearch(s)}>View</Button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══ STEP 2: COMPANIES ══ */}
      {step === 'companies' && currentSearch && (
        <div>
          <div className="flex items-center gap-2.5 mb-4 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setStep('search')} className="gap-1.5">
              <ArrowLeft size={12} /> Back
            </Button>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-foreground m-0">
                {companies.length} companies{' '}
                <span className="font-normal text-muted-foreground">
                  — {currentSearch.sector} · {(currentSearch.locations ?? [currentSearch.location]).join(', ')}
                </span>
              </p>
              {skipped > 0 && <p className="text-[11px] text-amber-600 mt-0.5 mb-0">{skipped} duplicate(s) excluded</p>}
            </div>
            {isHistory
              ? <span className="text-[12px] text-muted-foreground/50 italic">Read-only — history</span>
              : (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-muted-foreground">{selCompanies.size} selected</span>
                  <Tip text="Looks up decision-makers (Risk Managers, CFOs, Operations leads) at the selected companies using Apollo.io. Tick the companies you want before clicking." />
                  <Button size="sm" onClick={fetchPeople} disabled={selCompanies.size === 0 || fetchingPeople} className="gap-1.5">
                    {fetchingPeople
                      ? <><Loader2 size={12} className="animate-spin" /> Fetching…</>
                      : <><Users size={12} /> Fetch People ({selCompanies.size})</>
                    }
                  </Button>
                </div>
              )
            }
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {!isHistory && <Th w={36}><input type="checkbox" checked={selCompanies.size === companies.length && companies.length > 0} onChange={e => setSelCompanies(e.target.checked ? new Set(companies.map(c => c.id)) : new Set())} /></Th>}
                    {['#', 'Company', 'Industry', 'Headcount', 'People Status', 'Count'].map(h => <Th key={h}>{h}</Th>)}
                  </tr>
                </thead>
                <tbody>
                  {companies.map(c => (
                    <tr key={c.id}>
                      {!isHistory && (
                        <Td><input type="checkbox" checked={selCompanies.has(c.id)} onChange={e => setSelCompanies(prev => { const n = new Set(prev); e.target.checked ? n.add(c.id) : n.delete(c.id); return n })} /></Td>
                      )}
                      <Td className="text-muted-foreground/40 text-[11px] w-9">{c.source_rank}</Td>
                      <Td className="font-medium text-foreground">{c.name}</Td>
                      <Td className="text-muted-foreground text-[12px]">{c.industry ?? '—'}</Td>
                      <Td className="text-muted-foreground text-[12px]">{c.employee_count ? c.employee_count.toLocaleString() : '—'}</Td>
                      <Td>
                        {c.people_fetched
                          ? <TBadge label="Fetched" color="#166534" bg="#f0fdf4" />
                          : <TBadge label="Pending" color="hsl(var(--muted-foreground))" bg="hsl(var(--muted))" />
                        }
                      </Td>
                      <Td className={c.people_count > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground/30'}>
                        {c.people_count > 0 ? c.people_count : '—'}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {people.length > 0 && (
            <div className="mt-3.5 flex justify-end">
              <Button onClick={() => setStep('people')} className="gap-1.5">
                <Users size={12} /> View {people.length} people →
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ══ STEP 3: PEOPLE ══ */}
      {step === 'people' && currentSearch && (
        <div>
          <div className="flex items-center gap-2.5 mb-4 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setStep('companies')} className="gap-1.5">
              <ArrowLeft size={12} /> Companies
            </Button>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-foreground m-0">
                {people.length} people —{' '}
                <span className="font-normal text-muted-foreground">{currentSearch.sector}</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 mb-0">
                From {new Set(people.map(p => p.company_id)).size} companies
              </p>
            </div>
            {isHistory && <span className="text-[12px] text-muted-foreground/50 italic">Read-only — history</span>}
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Name', 'Title', 'Company', 'Location', 'Email', 'LinkedIn'].map(h => <Th key={h}>{h}</Th>)}
                  </tr>
                </thead>
                <tbody>
                  {pagedPeople.map(p => (
                    <tr key={p.id}>
                      <Td className="font-medium text-foreground">{p.full_name || '—'}</Td>
                      <Td className="text-muted-foreground max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap">{p.title || p.headline || '—'}</Td>
                      <Td className="text-muted-foreground">{p.company_name}</Td>
                      <Td className="text-muted-foreground/70">{p.location || '—'}</Td>
                      <Td>
                        {p.email
                          ? <span className="text-emerald-700 font-medium text-[12px]">{p.email}</span>
                          : p.email_requested
                          ? <span className="text-muted-foreground/50 text-[11px]">Not found</span>
                          : fetchingEmailFor.has(p.id)
                          ? <Loader2 size={12} className="animate-spin text-muted-foreground" />
                          : !isHistory
                          ? (
                            <button onClick={() => fetchEmailForPerson(p.id)}
                              className="text-[11px] px-2 py-0.5 rounded border-0 cursor-pointer bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                              Get Email
                            </button>
                          )
                          : <span className="text-muted-foreground/20 text-[11px]">—</span>
                        }
                      </Td>
                      <Td>
                        {p.linkedin_url
                          ? <a href={p.linkedin_url} target="_blank" rel="noreferrer"
                              className="text-primary text-[11px] inline-flex items-center gap-1 no-underline">
                              View <ExternalLink size={10} />
                            </a>
                          : <span className="text-muted-foreground/20 text-[11px]">—</span>
                        }
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3.5 pt-3 border-t border-[--border-subtle] px-4 pb-3">
                  <span className="text-[12px] text-muted-foreground">
                    {(peoplePage - 1) * PEOPLE_PAGE_SIZE + 1}–{Math.min(peoplePage * PEOPLE_PAGE_SIZE, people.length)} of {people.length}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => setPeoplePage(p => Math.max(1, p - 1))} disabled={peoplePage === 1} className="text-[11px] h-7 px-2">← Prev</Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                      <Button key={n} variant={n === peoplePage ? 'default' : 'outline'} size="sm" onClick={() => setPeoplePage(n)} className="text-[11px] h-7 w-7 p-0">{n}</Button>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setPeoplePage(p => Math.min(totalPages, p + 1))} disabled={peoplePage === totalPages} className="text-[11px] h-7 px-2">Next →</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {people.some(p => p.email_requested) && (
            <div className="mt-3.5 flex justify-end">
              <Button onClick={() => setStep('emails')} className="gap-1.5">
                <Mail size={12} /> View email results →
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ══ STEP 4: EMAILS ══ */}
      {step === 'emails' && (
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <Button variant="outline" size="sm" onClick={() => setStep('people')} className="gap-1.5">
              <ArrowLeft size={12} /> People
            </Button>
            <div className="flex-1">
              <p className="text-[14px] font-bold text-foreground m-0">Email Lookup Results</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 mb-0">
                <span className="text-emerald-700 font-semibold">{people.filter(p => p.email).length} found</span>
                {' · '}
                <span>{people.filter(p => p.email_requested && !p.email).length} not found</span>
              </p>
            </div>
            <Link href="/outbound/leads" className="no-underline">
              <Button size="sm" className="gap-1.5" style={{ background: '#166534' }}>
                <CheckCircle size={12} /> View Lead Database →
              </Button>
            </Link>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Name', 'Email', 'Status', 'Company', 'Title', 'Saved'].map(h => <Th key={h}>{h}</Th>)}
                  </tr>
                </thead>
                <tbody>
                  {people.filter(p => p.email_requested).map(p => (
                    <tr key={p.id}>
                      <Td className="font-medium text-foreground">{p.full_name || '—'}</Td>
                      <Td className={cn('text-[12px]', p.email ? 'text-emerald-700 font-medium' : 'text-muted-foreground/40')}>
                        {p.email || 'Not found'}
                      </Td>
                      <Td>
                        <TBadge
                          label={p.email_status ?? (p.email ? 'valid' : 'not_found')}
                          color={p.email ? '#166534' : '#991b1b'}
                          bg={p.email ? '#f0fdf4' : '#fef2f2'}
                        />
                      </Td>
                      <Td className="text-muted-foreground">{p.company_name}</Td>
                      <Td className="text-muted-foreground/70 max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap">{p.title || p.headline || '—'}</Td>
                      <Td>
                        {p.outbound_lead_id
                          ? <span className="inline-flex items-center gap-1 text-emerald-700 text-[12px]"><CheckCircle size={12} /> Saved</span>
                          : <span className="text-muted-foreground/20 text-[12px]">—</span>
                        }
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </AppScrollPage>
  )
}
