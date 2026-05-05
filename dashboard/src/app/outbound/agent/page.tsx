'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Search, Building2, Users, Mail, ChevronRight,
  Clock, ArrowLeft, AlertCircle, CheckCircle, ExternalLink, Loader2,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'search' | 'companies' | 'people' | 'emails'

interface SearchRun {
  id: string; sector: string; location: string; geo_id: string
  product_type: string; roles_targeted: string[]; cron_preference: string | null
  company_count: number; status: string; created_at: string
}

interface Company {
  id: string; search_id: string; name: string; source_rank: number
  people_fetched: boolean; people_count: number; created_at: string
}

interface Person {
  id: string; search_id: string; company_id: string; company_name: string
  first_name: string | null; last_name: string | null; full_name: string | null
  username: string | null; headline: string | null; linkedin_url: string | null
  profile_picture: string | null; location: string | null; summary: string | null
  email_requested: boolean; email: string | null; email_status: string | null
  outbound_lead_id: string | null
}

interface EmailResult {
  id: string; email: string | null; email_status: string; outbound_lead_id: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRODUCT_TYPES = [
  { value: 'assets',       label: 'Business Assets' },
  { value: 'liabilities',  label: 'Business Liabilities' },
  { value: 'workforce',    label: 'Workforce' },
  { value: 'api',          label: 'API' },
]

const PRODUCT_ROLES: Record<string, string> = {
  api:         'CTO, VP Engineering, Product Manager',
  assets:      'CEO, COO, Managing Director, CFO',
  liabilities: 'CEO, COO, CFO, Head of Risk, Head of Compliance',
  workforce:   'CEO, COO, HR Director, Chief People Officer',
}

const LOCATIONS: Record<string, string> = {
  'Singapore': '102454443',
  'Hong Kong': '103291313',
}

const CRON_OPTIONS = [
  { value: 'none',   label: 'None (run once)' },
  { value: 'daily',  label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
]

const PER_PAGE         = 30
const CREDITS_PER_EMAIL = 5

// ── Shared styles ─────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: '20px 24px',
}

const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 5,
  display: 'block', letterSpacing: '0.04em', textTransform: 'uppercase',
}

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 7,
  border: '1px solid #e5e5e5', background: '#fafafa', color: '#111',
  outline: 'none', boxSizing: 'border-box',
}

const btnPrimary = (disabled = false, bg = '#111'): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', borderRadius: 8, border: 'none',
  background: bg, color: '#fff', fontSize: 13, fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
  whiteSpace: 'nowrap',
})

const btnSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '6px 12px', borderRadius: 7, border: '1px solid #e5e5e5',
  background: '#fff', color: '#333', fontSize: 12, fontWeight: 500,
  cursor: 'pointer', whiteSpace: 'nowrap',
}

const thStyle: React.CSSProperties = {
  padding: '7px 10px', textAlign: 'left', color: '#aaa',
  fontWeight: 600, fontSize: 11, borderBottom: '1px solid #f0f0f0',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '9px 10px', borderBottom: '1px solid #f8f8f8', fontSize: 13,
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 24 }}>
      {steps.map((s, i) => (
        <div key={s.key} style={{ display: 'flex', alignItems: 'center' }}>
          {i > 0 && <ChevronRight size={12} style={{ color: '#d1d5db', margin: '0 2px' }} />}
          <button
            onClick={() => canGo[s.key] && onNav(s.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 11px', borderRadius: 6, border: 'none',
              background: step === s.key ? '#111' : canGo[s.key] ? '#f4f4f5' : 'transparent',
              color:      step === s.key ? '#fff'  : canGo[s.key] ? '#444'   : '#ccc',
              fontSize: 12, fontWeight: step === s.key ? 600 : 400,
              cursor: canGo[s.key] ? 'pointer' : 'default',
            }}
          >
            {s.icon} {s.label}
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      color, background: bg, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OutboundAgentPage() {
  // Wizard state
  const [step,      setStep]      = useState<Step>('search')
  const [isHistory, setIsHistory] = useState(false)

  // Data
  const [history,       setHistory]       = useState<SearchRun[]>([])
  const [currentSearch, setCurrentSearch] = useState<SearchRun | null>(null)
  const [companies,     setCompanies]     = useState<Company[]>([])
  const [people,        setPeople]        = useState<Person[]>([])
  const [emailResults,  setEmailResults]  = useState<EmailResult[]>([])

  // Selection
  const [selCompanies, setSelCompanies] = useState<Set<string>>(new Set())
  const [selPeople,    setSelPeople]    = useState<Set<string>>(new Set())

  // UI
  const [loading,         setLoading]         = useState(false)
  const [fetchingPeople,  setFetchingPeople]   = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [skipped,         setSkipped]         = useState(0)
  const [creditModal,     setCreditModal]     = useState(false)
  const [peoplePage,      setPeoplePage]      = useState(1)

  // Form
  const [sector,      setSector]      = useState('')
  const [location,    setLocation]    = useState('Singapore')
  const [productType, setProductType] = useState('')
  const [cronPref,    setCronPref]    = useState('none')

  const loadHistory = useCallback(async () => {
    const res  = await fetch('/api/outbound/history')
    const data = await res.json()
    setHistory(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  // ── Persist active search to sessionStorage so sidebar navigation doesn't wipe state ──
  useEffect(() => {
    if (!currentSearch) return
    sessionStorage.setItem('ob_agent_session', JSON.stringify({ search: currentSearch, step }))
  }, [currentSearch, step])

  // ── Restore on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    const raw = sessionStorage.getItem('ob_agent_session')
    if (!raw) return
    try {
      const { search, step: savedStep } = JSON.parse(raw) as { search: SearchRun; step: Step }
      if (!search?.id) return
      setCurrentSearch(search)
      setLoading(true)
      fetch(`/api/outbound/history?id=${search.id}`)
        .then(r => r.json())
        .then(data => {
          const restoredCompanies: Company[] = Array.isArray(data.companies) ? data.companies : []
          const restoredPeople:   Person[]  = Array.isArray(data.people)    ? data.people    : []
          setCompanies(restoredCompanies)
          setPeople(restoredPeople)

          // Reconstruct email results from people who already had emails looked up
          const alreadyEmailed = restoredPeople.filter(p => p.email_requested)
          if (alreadyEmailed.length > 0) {
            setEmailResults(alreadyEmailed.map(p => ({
              id:               p.id,
              email:            p.email,
              email_status:     p.email_status ?? 'unknown',
              outbound_lead_id: p.outbound_lead_id,
            })))
          }

          // Restore step — validate it's still valid
          if (savedStep === 'emails' && alreadyEmailed.length > 0) setStep('emails')
          else if (savedStep === 'people' && restoredPeople.length > 0) setStep('people')
          else if (restoredCompanies.length > 0) setStep('companies')
        })
        .finally(() => setLoading(false))
    } catch { /* ignore corrupt session */ }
  }, []) // intentionally empty — restore only on mount

  const canGo: Record<Step, boolean> = {
    search:    true,
    companies: !!currentSearch,
    people:    !!currentSearch && people.length > 0,
    emails:    emailResults.length > 0,
  }

  // ── Step 1: Run search ────────────────────────────────────────────────────

  async function runSearch() {
    if (!sector.trim() || !productType) { setError('Fill in sector and product type.'); return }
    setError(null); setLoading(true); setIsHistory(false)
    setCompanies([]); setPeople([]); setEmailResults([])
    setSelCompanies(new Set()); setSelPeople(new Set())
    sessionStorage.removeItem('ob_agent_session')

    try {
      const res  = await fetch('/api/outbound/gemini-search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sector: sector.trim(), location,
          geoId: LOCATIONS[location], productType,
          cronPreference: cronPref === 'none' ? null : cronPref,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')

      setCurrentSearch({
        id: data.searchId, sector: sector.trim(), location,
        geo_id: LOCATIONS[location], product_type: productType,
        roles_targeted: [], cron_preference: cronPref === 'none' ? null : cronPref,
        company_count: data.companies.length, status: 'completed',
        created_at: new Date().toISOString(),
      })
      setCompanies(data.companies)
      setSkipped(data.skipped ?? 0)
      setStep('companies')
      loadHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally { setLoading(false) }
  }

  // ── History: load a past search (read-only) ───────────────────────────────

  async function viewHistorySearch(s: SearchRun) {
    setLoading(true); setIsHistory(true); setCurrentSearch(s)
    setEmailResults([]); setSelCompanies(new Set()); setSelPeople(new Set())
    try {
      const res  = await fetch(`/api/outbound/history?id=${s.id}`)
      const data = await res.json()
      setCompanies(Array.isArray(data.companies) ? data.companies : [])
      setPeople(Array.isArray(data.people)       ? data.people    : [])
      setStep('companies')
    } catch { setError('Failed to load history') }
    finally  { setLoading(false) }
  }

  // ── Step 2: Fetch people ──────────────────────────────────────────────────

  async function fetchPeople() {
    if (!currentSearch || selCompanies.size === 0) return
    setFetchingPeople(true); setError(null)
    try {
      const res  = await fetch('/api/outbound/people-fetch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchId: currentSearch.id, companyIds: Array.from(selCompanies) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'People fetch failed')

      setPeople(Array.isArray(data.people) ? data.people : [])
      setCompanies(prev => prev.map(c =>
        selCompanies.has(c.id) ? { ...c, people_fetched: true } : c
      ))
      setSelCompanies(new Set()); setPeoplePage(1); setStep('people')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'People fetch failed')
    } finally { setFetchingPeople(false) }
  }

  // ── Step 3: Email lookup ──────────────────────────────────────────────────

  async function runEmailLookup() {
    if (!currentSearch || selPeople.size === 0) return
    setCreditModal(false); setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/outbound/email-find', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personIds: Array.from(selPeople) }),
      })
      const data = await res.json()
      if (res.status === 402) throw new Error(data.error)
      if (!res.ok)            throw new Error(data.error ?? 'Email lookup failed')

      const results: EmailResult[] = Array.isArray(data.results) ? data.results : []
      setEmailResults(results)
      const map = new Map(results.map(r => [r.id, r]))
      setPeople(prev => prev.map(p => {
        const r = map.get(p.id)
        return r ? { ...p, email: r.email, email_status: r.email_status, email_requested: true, outbound_lead_id: r.outbound_lead_id } : p
      }))
      setSelPeople(new Set()); setStep('emails')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Email lookup failed')
    } finally { setLoading(false) }
  }

  // ── People pagination ─────────────────────────────────────────────────────

  const totalPages  = Math.ceil(people.length / PER_PAGE)
  const pagedPeople = people.slice((peoplePage - 1) * PER_PAGE, peoplePage * PER_PAGE)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1140, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>
          Outbound AI Agent
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#aaa' }}>
          Search companies → find decision-makers → get verified emails
        </p>
      </div>

      <Breadcrumb step={step} onNav={setStep} canGo={canGo} />

      {/* Error */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', marginBottom: 16, borderRadius: 8,
          background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13,
        }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* ══════════════════ STEP 1: SEARCH ══════════════════ */}
      {step === 'search' && (
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, alignItems: 'start' }}>

          {/* Form card */}
          <div style={card}>
            <p style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, color: '#111' }}>New Search</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div>
                <span style={lbl}>Industry / Sector *</span>
                <input style={inp} placeholder="e.g. SaaS, FinTech, Logistics"
                  value={sector} onChange={e => setSector(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && runSearch()} />
              </div>

              <div>
                <span style={lbl}>Location *</span>
                <select style={inp} value={location} onChange={e => setLocation(e.target.value)}>
                  {Object.keys(LOCATIONS).map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <div>
                <span style={lbl}>Product / Service Type *</span>
                <select style={inp} value={productType} onChange={e => setProductType(e.target.value)}>
                  <option value="">Select type…</option>
                  {PRODUCT_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                </select>
                {productType && (
                  <p style={{ margin: '5px 0 0', fontSize: 11, color: '#888', lineHeight: 1.4 }}>
                    Targeting: {PRODUCT_ROLES[productType]}
                  </p>
                )}
              </div>

              <div>
                <span style={lbl}>Scheduled Run</span>
                <select style={inp} value={cronPref} onChange={e => setCronPref(e.target.value)}>
                  {CRON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#ccc' }}>Cron scheduling — coming soon</p>
              </div>
            </div>

            <button
              onClick={runSearch}
              disabled={loading || !sector.trim() || !productType}
              style={{ ...btnPrimary(loading || !sector.trim() || !productType), marginTop: 18, width: '100%', justifyContent: 'center' }}
            >
              {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={13} />}
              {loading ? 'Searching…' : 'Run Search'}
            </button>
          </div>

          {/* History card */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Clock size={13} style={{ color: '#888' }} />
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111' }}>Search History</p>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#bbb' }}>Last 30 days</span>
            </div>

            {history.length === 0 ? (
              <p style={{ fontSize: 13, color: '#ccc', textAlign: 'center', padding: '24px 0' }}>No searches yet</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Date', 'Sector', 'Location', 'Type', 'Companies', ''].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map(s => (
                    <tr key={s.id}>
                      <td style={{ ...tdStyle, color: '#888', whiteSpace: 'nowrap' }}>
                        {new Date(s.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </td>
                      <td style={{ ...tdStyle, color: '#111', fontWeight: 500, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.sector}</td>
                      <td style={{ ...tdStyle, color: '#666' }}>{s.location}</td>
                      <td style={{ ...tdStyle }}>
                        <Badge
                          label={PRODUCT_TYPES.find(p => p.value === s.product_type)?.label ?? s.product_type}
                          color="#555" bg="#f4f4f5"
                        />
                      </td>
                      <td style={{ ...tdStyle, color: '#111', fontWeight: 600 }}>{s.company_count}</td>
                      <td style={{ ...tdStyle }}>
                        <button onClick={() => viewHistorySearch(s)} style={{ ...btnSecondary, fontSize: 11, padding: '3px 10px' }}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════ STEP 2: COMPANIES ══════════════════ */}
      {step === 'companies' && currentSearch && (
        <div>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <button onClick={() => setStep('search')} style={btnSecondary}>
              <ArrowLeft size={12} /> Back
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111' }}>
                {companies.length} companies — <span style={{ fontWeight: 400, color: '#555' }}>{currentSearch.sector} · {currentSearch.location}</span>
              </p>
              {skipped > 0 && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#f59e0b' }}>{skipped} duplicate(s) excluded</p>}
            </div>

            {isHistory
              ? <span style={{ fontSize: 12, color: '#bbb', fontStyle: 'italic' }}>Read-only — history</span>
              : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#888' }}>{selCompanies.size} selected</span>
                  <button
                    onClick={fetchPeople}
                    disabled={selCompanies.size === 0 || fetchingPeople}
                    style={btnPrimary(selCompanies.size === 0 || fetchingPeople)}
                  >
                    {fetchingPeople
                      ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Fetching…</>
                      : <><Users size={12} /> Fetch People ({selCompanies.size})</>
                    }
                  </button>
                </div>
              )
            }
          </div>

          <div style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {!isHistory && (
                    <th style={{ ...thStyle, width: 36 }}>
                      <input type="checkbox"
                        checked={selCompanies.size === companies.length && companies.length > 0}
                        onChange={e => setSelCompanies(e.target.checked ? new Set(companies.map(c => c.id)) : new Set())}
                      />
                    </th>
                  )}
                  {['#', 'Company', 'People Status', 'Count'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {companies.map(c => (
                  <tr key={c.id}>
                    {!isHistory && (
                      <td style={tdStyle}>
                        <input type="checkbox"
                          checked={selCompanies.has(c.id)}
                          onChange={e => setSelCompanies(prev => {
                            const n = new Set(prev)
                            e.target.checked ? n.add(c.id) : n.delete(c.id)
                            return n
                          })}
                        />
                      </td>
                    )}
                    <td style={{ ...tdStyle, color: '#ccc', fontSize: 11, width: 36 }}>{c.source_rank}</td>
                    <td style={{ ...tdStyle, color: '#111', fontWeight: 500 }}>{c.name}</td>
                    <td style={tdStyle}>
                      {c.people_fetched
                        ? <Badge label="People fetched" color="#166534" bg="#f0fdf4" />
                        : <Badge label="Not fetched"    color="#888"    bg="#f4f4f5" />
                      }
                    </td>
                    <td style={{ ...tdStyle, color: c.people_count > 0 ? '#111' : '#ccc', fontWeight: c.people_count > 0 ? 600 : 400 }}>
                      {c.people_count > 0 ? c.people_count : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* If people already loaded (history or multi-fetch) */}
          {people.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setStep('people')} style={btnPrimary()}>
                <Users size={12} /> View {people.length} people →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════ STEP 3: PEOPLE ══════════════════ */}
      {step === 'people' && currentSearch && (
        <div>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <button onClick={() => setStep('companies')} style={btnSecondary}>
              <ArrowLeft size={12} /> Companies
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111' }}>
                {people.length} people — <span style={{ fontWeight: 400, color: '#555' }}>{currentSearch.sector} · {currentSearch.location}</span>
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#888' }}>
                From {new Set(people.map(p => p.company_id)).size} companies
              </p>
            </div>

            {isHistory
              ? <span style={{ fontSize: 12, color: '#bbb', fontStyle: 'italic' }}>Read-only — history</span>
              : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#888' }}>{selPeople.size} selected</span>
                  <button
                    onClick={() => selPeople.size > 0 && setCreditModal(true)}
                    disabled={selPeople.size === 0 || loading}
                    style={btnPrimary(selPeople.size === 0 || loading, '#1d4ed8')}
                  >
                    {loading
                      ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Looking up…</>
                      : <><Mail size={12} /> Request Emails ({selPeople.size} · {selPeople.size * CREDITS_PER_EMAIL} credits)</>
                    }
                  </button>
                </div>
              )
            }
          </div>

          {/* Credit warning modal */}
          {creditModal && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                background: '#fff', borderRadius: 14, padding: '28px 32px',
                maxWidth: 420, width: '90%',
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
              }}>
                <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#111' }}>Confirm Email Lookup</p>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#555', lineHeight: 1.65 }}>
                  Looking up emails for <strong>{selPeople.size} {selPeople.size === 1 ? 'person' : 'people'}</strong> will use{' '}
                  <strong>{selPeople.size * CREDITS_PER_EMAIL} Netrows credits</strong> (5 per lookup).
                </p>
                <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                    Monthly limit: 10,000 credits. Credits are consumed even if no email is found.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setCreditModal(false)} style={btnSecondary}>Cancel</button>
                  <button onClick={runEmailLookup} style={btnPrimary(false, '#1d4ed8')}>
                    Confirm — {selPeople.size * CREDITS_PER_EMAIL} credits
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {!isHistory && (
                    <th style={{ ...thStyle, width: 36 }}>
                      <input type="checkbox"
                        checked={pagedPeople.length > 0 && pagedPeople.every(p => selPeople.has(p.id) || p.email_requested)}
                        onChange={e => setSelPeople(prev => {
                          const n = new Set(prev)
                          pagedPeople.filter(p => !p.email_requested)
                            .forEach(p => e.target.checked ? n.add(p.id) : n.delete(p.id))
                          return n
                        })}
                      />
                    </th>
                  )}
                  {['Name', 'Title', 'Company', 'Location', 'Email', 'LinkedIn'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedPeople.map(p => (
                  <tr key={p.id}>
                    {!isHistory && (
                      <td style={tdStyle}>
                        <input type="checkbox"
                          checked={selPeople.has(p.id)}
                          disabled={p.email_requested}
                          onChange={e => setSelPeople(prev => {
                            const n = new Set(prev)
                            e.target.checked ? n.add(p.id) : n.delete(p.id)
                            return n
                          })}
                        />
                      </td>
                    )}
                    <td style={{ ...tdStyle, color: '#111', fontWeight: 500 }}>{p.full_name || '—'}</td>
                    <td style={{ ...tdStyle, color: '#555', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.headline || '—'}
                    </td>
                    <td style={{ ...tdStyle, color: '#555' }}>{p.company_name}</td>
                    <td style={{ ...tdStyle, color: '#888' }}>{p.location || '—'}</td>
                    <td style={tdStyle}>
                      {p.email
                        ? <span style={{ color: '#166534', fontWeight: 500, fontSize: 12 }}>{p.email}</span>
                        : p.email_requested
                        ? <span style={{ color: '#aaa', fontSize: 11 }}>Not found</span>
                        : <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>
                      }
                    </td>
                    <td style={tdStyle}>
                      {p.linkedin_url
                        ? <a href={p.linkedin_url} target="_blank" rel="noreferrer"
                            style={{ color: '#1d4ed8', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            View <ExternalLink size={10} />
                          </a>
                        : <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
                <span style={{ fontSize: 12, color: '#888' }}>
                  {(peoplePage - 1) * PER_PAGE + 1}–{Math.min(peoplePage * PER_PAGE, people.length)} of {people.length}
                </span>
                <div style={{ display: 'flex', gap: 3 }}>
                  <button onClick={() => setPeoplePage(p => Math.max(1, p - 1))} disabled={peoplePage === 1}
                    style={{ ...btnSecondary, opacity: peoplePage === 1 ? 0.4 : 1 }}>← Prev</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                    <button key={n} onClick={() => setPeoplePage(n)} style={{
                      ...btnSecondary,
                      background: n === peoplePage ? '#111' : '#fff',
                      color:      n === peoplePage ? '#fff' : '#333',
                      borderColor: n === peoplePage ? '#111' : '#e5e5e5',
                    }}>{n}</button>
                  ))}
                  <button onClick={() => setPeoplePage(p => Math.min(totalPages, p + 1))} disabled={peoplePage === totalPages}
                    style={{ ...btnSecondary, opacity: peoplePage === totalPages ? 0.4 : 1 }}>Next →</button>
                </div>
              </div>
            )}
          </div>

          {/* Jump to emails if already done */}
          {emailResults.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setStep('emails')} style={btnPrimary()}>
                <Mail size={12} /> View email results →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════ STEP 4: EMAILS ══════════════════ */}
      {step === 'emails' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <button onClick={() => setStep('people')} style={btnSecondary}>
              <ArrowLeft size={12} /> People
            </button>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111' }}>Email Lookup Results</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#888' }}>
                <span style={{ color: '#166534', fontWeight: 600 }}>{people.filter(p => p.email).length} found</span>
                {' · '}
                <span style={{ color: '#888' }}>{people.filter(p => p.email_requested && !p.email).length} not found</span>
              </p>
            </div>
            <Link href="/outbound/leads" style={{ ...btnPrimary(false, '#166534'), textDecoration: 'none' }}>
              <CheckCircle size={12} /> View Outbound Leads →
            </Link>
          </div>

          <div style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Name', 'Email', 'Status', 'Company', 'Title', 'Saved to Leads'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.filter(p => p.email_requested).map(p => (
                  <tr key={p.id}>
                    <td style={{ ...tdStyle, color: '#111', fontWeight: 500 }}>{p.full_name || '—'}</td>
                    <td style={{ ...tdStyle, color: p.email ? '#166534' : '#bbb', fontWeight: p.email ? 500 : 400, fontSize: 12 }}>
                      {p.email || 'Not found'}
                    </td>
                    <td style={tdStyle}>
                      <Badge
                        label={p.email_status ?? (p.email ? 'valid' : 'not_found')}
                        color={p.email ? '#166534' : '#991b1b'}
                        bg={p.email ? '#f0fdf4' : '#fef2f2'}
                      />
                    </td>
                    <td style={{ ...tdStyle, color: '#555' }}>{p.company_name}</td>
                    <td style={{ ...tdStyle, color: '#888', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.headline || '—'}
                    </td>
                    <td style={tdStyle}>
                      {p.outbound_lead_id
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#166534', fontSize: 12 }}>
                            <CheckCircle size={12} /> Saved
                          </span>
                        : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Spinner keyframes */}
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
