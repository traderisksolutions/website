'use client'

import { useState, useEffect, useCallback } from 'react'
import { Crosshair, Globe, Bot, Trash2, Play } from 'lucide-react'
import React from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

type Mode       = 'criteria' | 'lookup' | 'agent'
type SearchType = 'people' | 'company'

interface PeopleResult {
  fullName: string; headline: string; summary: string
  profilePicture: string; location: string; profileURL: string; username: string
}
interface CompanyResult {
  id: number; name: string; universalName: string
  tagline: string; logo: string; linkedinURL: string
}
type SearchResult = PeopleResult | CompanyResult

interface SavedLead {
  id?: string; full_name?: string | null; headline?: string | null
  current_title?: string | null; current_company?: string | null
  profile_picture?: string | null; logo_url?: string | null
  record_type?: string | null; location?: string | null
}

interface AgentEvent {
  step: number; status: 'running' | 'done' | 'error'
  message: string; count?: number; companiesFound?: number; leadsTotal?: number
}

interface Schedule {
  id: string; created_at: string; query: string; roles: string[]
  max_companies: number; frequency: 'daily' | 'weekly'; is_active: boolean
  last_run_at: string | null; next_run_at: string | null
  runs_count: number; leads_last: number
}

// ── Constants ──────────────────────────────────────────────────────────────

const LOCATIONS = [
  { label: 'Singapore',      value: '102454443' },
  { label: 'Hong Kong',      value: '103291313' },
  { label: 'Malaysia',       value: '103368990' },
  { label: 'Australia',      value: '101452733' },
  { label: 'United Kingdom', value: '101165590' },
  { label: 'United States',  value: '103644278' },
]

const INDUSTRIES = [
  { label: 'Financial Services',   value: '43' },
  { label: 'Insurance',            value: '44' },
  { label: 'Banking',              value: '45' },
  { label: 'Computer Software',    value: '4'  },
  { label: 'Management Consulting', value: '96' },
  { label: 'Accounting',           value: '41' },
]

const COMPANY_SIZES = [
  { label: '1–10',    value: 'A' }, { label: '11–50',   value: 'B' },
  { label: '51–200',  value: 'C' }, { label: '201–500',  value: 'D' },
  { label: '501–1k',  value: 'E' }, { label: '1k–5k',    value: 'F' },
  { label: '5k–10k',  value: 'G' }, { label: '10k+',     value: 'H' },
]

const ALL_ROLES = ['CEO', 'CTO', 'Founder', 'CFO', 'COO', 'Head of Risk', 'Director', 'VP']

const STEP_ICONS: Record<number, string> = { 1: '🔍', 2: '🤖', 3: '🔗', 4: '✅' }

// ── Shared styles ──────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: '#888',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 7,
  border: '1px solid #e5e5e5', background: '#fafafa', color: '#111',
  outline: 'none', boxSizing: 'border-box',
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} style={inputStyle} />
    </div>
  )
}

function isPerson(r: SearchResult): r is PeopleResult { return 'fullName' in r }

// ── Result Card ────────────────────────────────────────────────────────────

function ResultCard({ result, saved, saving, onSave }: {
  result: SearchResult; saved: boolean; saving: boolean; onSave: () => void
}) {
  const person  = isPerson(result)
  const name    = person ? (result as PeopleResult).fullName  : (result as CompanyResult).name
  const sub     = person ? (result as PeopleResult).headline  : (result as CompanyResult).tagline
  const loc     = person ? (result as PeopleResult).location  : null
  const picture = person ? (result as PeopleResult).profilePicture : (result as CompanyResult).logo
  const url     = person ? (result as PeopleResult).profileURL    : (result as CompanyResult).linkedinURL

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {picture ? (
          <img src={picture} alt="" style={{ width: 40, height: 40, borderRadius: person ? '50%' : 8, objectFit: 'cover', flexShrink: 0, background: '#f4f4f5' }} />
        ) : (
          <div style={{ width: 40, height: 40, borderRadius: person ? '50%' : 8, background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>
            {person ? '👤' : '🏢'}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111', lineHeight: 1.3 }}>{name}</p>
          {sub && <p style={{ margin: '3px 0 0', fontSize: 12, color: '#666', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{sub}</p>}
          {loc && <p style={{ margin: '3px 0 0', fontSize: 11, color: '#aaa' }}>{loc}</p>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#0a66c2', textDecoration: 'none' }}>View on LinkedIn ↗</a>
        <div style={{ flex: 1 }} />
        <button onClick={onSave} disabled={saved || saving} style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid', borderColor: saved ? '#16a34a' : '#111', background: saved ? '#f0fdf4' : '#111', color: saved ? '#16a34a' : '#fff', cursor: saved || saving ? 'default' : 'pointer' }}>
          {saving ? '…' : saved ? '✓ Saved' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function OutboundSearchPage() {
  const [mode,       setMode]       = useState<Mode>('criteria')
  const [searchType, setSearchType] = useState<SearchType>('people')
  const [loading,    setLoading]    = useState(false)
  const [results,    setResults]    = useState<SearchResult[]>([])
  const [total,      setTotal]      = useState(0)
  const [savedUrls,  setSavedUrls]  = useState<Set<string>>(new Set())
  const [savingUrl,  setSavingUrl]  = useState<string | null>(null)
  const [error,      setError]      = useState<string | null>(null)

  // Criteria form
  const [keywordTitle,  setKeywordTitle]  = useState('')
  const [keywords,      setKeywords]      = useState('')
  const [geo,           setGeo]           = useState('102454443')
  const [company,       setCompany]       = useState('')
  const [keyword,       setKeyword]       = useState('')
  const [locations,     setLocations]     = useState('102454443')
  const [selectedSizes, setSelectedSizes] = useState<string[]>(['B', 'C', 'D'])
  const [industries,    setIndustries]    = useState('43')
  const [hasJobs,       setHasJobs]       = useState(false)

  // URL lookup
  const [lookupUrl,     setLookupUrl]     = useState('')
  const [lookupResult,  setLookupResult]  = useState<SavedLead | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)

  // Agent
  const [agentQuery,   setAgentQuery]   = useState('')
  const [agentRoles,   setAgentRoles]   = useState<string[]>(['CEO', 'CTO', 'Founder'])
  const [agentMaxCo,   setAgentMaxCo]   = useState(8)
  const [agentRunning, setAgentRunning] = useState(false)
  const [agentEvents,  setAgentEvents]  = useState<AgentEvent[]>([])
  const [agentDone,    setAgentDone]    = useState(false)
  const [schedules,    setSchedules]    = useState<Schedule[]>([])
  const [scheduling,   setScheduling]   = useState(false)
  const [schedFreq,    setSchedFreq]    = useState<'daily' | 'weekly'>('daily')

  const loadSchedules = useCallback(async () => {
    const res = await fetch('/api/outbound/schedules')
    if (res.ok) setSchedules(await res.json())
  }, [])

  useEffect(() => { loadSchedules() }, [loadSchedules])

  // ── Criteria search ──────────────────────────────────────────────────────

  async function runSearch() {
    setLoading(true); setError(null); setResults([])
    try {
      const body = searchType === 'people'
        ? { type: 'people', keywordTitle, keywords, geo, company }
        : { type: 'company', keyword, locations, companySizes: selectedSizes.join(','), industries, hasJobs }
      const res  = await fetch('/api/outbound/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Search failed'); return }
      const items = data.data?.items ?? []
      setResults(items)
      setTotal(data.data?.total ?? items.length)
    } catch { setError('Network error') }
    finally   { setLoading(false) }
  }

  async function saveResult(result: SearchResult) {
    const url    = isPerson(result) ? (result as PeopleResult).profileURL : (result as CompanyResult).linkedinURL
    setSavingUrl(url)
    try {
      const record = isPerson(result)
        ? { record_type: 'person', source: 'people_search', linkedin_url: (result as PeopleResult).profileURL, username: (result as PeopleResult).username, full_name: (result as PeopleResult).fullName, headline: (result as PeopleResult).headline, summary: (result as PeopleResult).summary, profile_picture: (result as PeopleResult).profilePicture, location: (result as PeopleResult).location, raw_payload: result }
        : { record_type: 'company', source: 'company_search', linkedin_id: (result as CompanyResult).id, linkedin_url: (result as CompanyResult).linkedinURL, username: (result as CompanyResult).universalName, full_name: (result as CompanyResult).name, headline: (result as CompanyResult).tagline, company_tagline: (result as CompanyResult).tagline, logo_url: (result as CompanyResult).logo, raw_payload: result }
      const res = await fetch('/api/outbound/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ record }) })
      if (res.ok) setSavedUrls(prev => new Set([...Array.from(prev), url]))
    } finally { setSavingUrl(null) }
  }

  // ── URL lookup ───────────────────────────────────────────────────────────

  async function runLookup() {
    if (!lookupUrl.trim()) return
    setLookupLoading(true); setLookupResult(null); setError(null)
    try {
      const res  = await fetch('/api/outbound/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: lookupUrl.trim() }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Lookup failed'); return }
      setLookupResult(data.lead)
    } catch { setError('Network error') }
    finally   { setLookupLoading(false) }
  }

  // ── AI Agent ─────────────────────────────────────────────────────────────

  async function runAgent() {
    if (!agentQuery.trim()) return
    setAgentRunning(true); setAgentEvents([]); setAgentDone(false)
    try {
      const res = await fetch('/api/outbound/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: agentQuery, roles: agentRoles, maxCompanies: agentMaxCo }),
      })
      if (!res.body) return
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event: AgentEvent = JSON.parse(line.slice(6))
            setAgentEvents(prev => {
              const idx = prev.findIndex(e => e.step === event.step)
              if (idx >= 0) { const next = [...prev]; next[idx] = event; return next }
              return [...prev, event]
            })
            if (event.step === 4 && event.status === 'done') setAgentDone(true)
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (e) {
      setAgentEvents(prev => [...prev, { step: -1, status: 'error', message: e instanceof Error ? e.message : 'Network error' }])
    } finally {
      setAgentRunning(false)
      loadSchedules()
    }
  }

  async function scheduleAgent() {
    if (!agentQuery.trim()) return
    setScheduling(true)
    try {
      await fetch('/api/outbound/schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: agentQuery, roles: agentRoles, maxCompanies: agentMaxCo, frequency: schedFreq }),
      })
      await loadSchedules()
    } finally { setScheduling(false) }
  }

  async function deleteSchedule(id: string) {
    await fetch('/api/outbound/schedules', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setSchedules(prev => prev.filter(s => s.id !== id))
  }

  async function toggleSchedule(id: string, is_active: boolean) {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, is_active } : s))
    await fetch('/api/outbound/schedules', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active }) })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const tabs: { key: Mode; label: string }[] = [
    { key: 'criteria', label: 'Criteria Search' },
    { key: 'lookup',   label: 'URL Lookup' },
    { key: 'agent',    label: 'AI Agent' },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Left panel ── */}
      <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid #e5e5e5', background: '#fff', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111', letterSpacing: '-0.02em' }}>Outbound Search</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#aaa' }}>Find & save LinkedIn prospects</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e5e5', flexShrink: 0 }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setMode(t.key)} style={{
              flex: 1, padding: '9px 0', fontSize: 11, fontWeight: mode === t.key ? 600 : 400,
              color: mode === t.key ? '#111' : '#888', background: 'none', border: 'none',
              borderBottom: mode === t.key ? '2px solid #111' : '2px solid transparent', cursor: 'pointer',
            }}>
              {t.key === 'agent' ? '🤖 ' : ''}{t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>

          {/* ── Criteria form ── */}
          {mode === 'criteria' && (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {(['people', 'company'] as SearchType[]).map(t => (
                  <button key={t} onClick={() => setSearchType(t)} style={{ flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 500, borderRadius: 7, border: '1px solid', borderColor: searchType === t ? '#111' : '#e5e5e5', background: searchType === t ? '#111' : '#fff', color: searchType === t ? '#fff' : '#555', cursor: 'pointer' }}>
                    {t === 'people' ? '👤 People' : '🏢 Company'}
                  </button>
                ))}
              </div>
              {searchType === 'people' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Field label="Title / Role" value={keywordTitle} onChange={setKeywordTitle} placeholder="e.g. CTO, Head of Risk" />
                  <Field label="Keywords"     value={keywords}     onChange={setKeywords}     placeholder="e.g. insurance, fintech" />
                  <div>
                    <label style={labelStyle}>Location</label>
                    <select value={geo} onChange={e => setGeo(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                      {LOCATIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>
                  <Field label="Company" value={company} onChange={setCompany} placeholder="e.g. Allianz, AIA" />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Field label="Keyword (required)" value={keyword} onChange={setKeyword} placeholder="e.g. insurance broker" />
                  <div>
                    <label style={labelStyle}>Location (required)</label>
                    <select value={locations} onChange={e => setLocations(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                      {LOCATIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Industry (required)</label>
                    <select value={industries} onChange={e => setIndustries(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                      {INDUSTRIES.map(i => <option key={`${i.value}-${i.label}`} value={i.value}>{i.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Company Size</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {COMPANY_SIZES.map(s => {
                        const checked = selectedSizes.includes(s.value)
                        return (
                          <button key={s.value} onClick={() => setSelectedSizes(prev => checked ? prev.filter(v => v !== s.value) : [...prev, s.value])} style={{ padding: '3px 9px', fontSize: 11, borderRadius: 5, border: '1px solid', borderColor: checked ? '#111' : '#e5e5e5', background: checked ? '#111' : '#fff', color: checked ? '#fff' : '#555', cursor: 'pointer' }}>
                            {s.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={hasJobs} onChange={e => setHasJobs(e.target.checked)} />
                    <span style={{ fontSize: 12, color: '#555' }}>Has active job postings</span>
                  </label>
                </div>
              )}
              {error && <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 7, fontSize: 12, color: '#991b1b' }}>{error}</div>}
              <button onClick={runSearch} disabled={loading} style={{ marginTop: 20, width: '100%', padding: '10px 0', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: loading ? '#aaa' : '#111', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Searching…' : 'Run Search →'}
              </button>
            </>
          )}

          {/* ── URL Lookup form ── */}
          {mode === 'lookup' && (
            <>
              <div>
                <label style={labelStyle}>LinkedIn URL</label>
                <input value={lookupUrl} onChange={e => setLookupUrl(e.target.value)} placeholder="https://www.linkedin.com/in/username" style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }} onKeyDown={e => e.key === 'Enter' && runLookup()} />
                <p style={{ margin: '5px 0 0', fontSize: 11, color: '#aaa' }}>Works for /in/... (people) and /company/...</p>
              </div>
              {error && <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 7, fontSize: 12, color: '#991b1b' }}>{error}</div>}
              <button onClick={runLookup} disabled={lookupLoading || !lookupUrl.trim()} style={{ marginTop: 16, width: '100%', padding: '10px 0', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: lookupLoading || !lookupUrl.trim() ? '#aaa' : '#111', color: '#fff', cursor: lookupLoading || !lookupUrl.trim() ? 'not-allowed' : 'pointer' }}>
                {lookupLoading ? 'Looking up…' : 'Lookup & Save →'}
              </button>
              {lookupResult && (
                <div style={{ marginTop: 16, padding: 14, borderRadius: 10, border: '1px solid #e5e5e5', background: '#f9f9f9' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    {(lookupResult.profile_picture || lookupResult.logo_url) && (
                      <img src={String(lookupResult.profile_picture ?? lookupResult.logo_url)} alt="" style={{ width: 40, height: 40, flexShrink: 0, objectFit: 'cover', borderRadius: lookupResult.record_type === 'person' ? '50%' : 8 }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111' }}>{String(lookupResult.full_name ?? '')}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#666' }}>{String(lookupResult.headline ?? '')}</p>
                      {lookupResult.current_company && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#aaa' }}>{String(lookupResult.current_title ?? '')} · {String(lookupResult.current_company)}</p>}
                    </div>
                  </div>
                  <div style={{ marginTop: 10, padding: '6px 10px', background: '#f0fdf4', borderRadius: 6, fontSize: 12, color: '#166534', fontWeight: 500 }}>✓ Saved to Outbound Leads</div>
                </div>
              )}
            </>
          )}

          {/* ── AI Agent form ── */}
          {mode === 'agent' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Target Query</label>
                <textarea
                  value={agentQuery}
                  onChange={e => setAgentQuery(e.target.value)}
                  placeholder="e.g. early stage fintech startups in Singapore"
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                />
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#aaa' }}>Natural language — the AI will search Google + LinkedIn</p>
              </div>

              <div>
                <label style={labelStyle}>Target Roles</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ALL_ROLES.map(role => {
                    const checked = agentRoles.includes(role)
                    return (
                      <button key={role} onClick={() => setAgentRoles(prev => checked ? prev.filter(r => r !== role) : [...prev, role])} style={{ padding: '3px 10px', fontSize: 11, borderRadius: 5, border: '1px solid', borderColor: checked ? '#111' : '#e5e5e5', background: checked ? '#111' : '#fff', color: checked ? '#fff' : '#555', cursor: 'pointer' }}>
                        {role}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Max Companies</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="range" min={3} max={20} value={agentMaxCo} onChange={e => setAgentMaxCo(Number(e.target.value))} style={{ flex: 1 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#111', minWidth: 24 }}>{agentMaxCo}</span>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: 11, color: '#aaa' }}>~{agentMaxCo * (agentRoles.length * 2 + 2)} Netrows credits per run</p>
              </div>

              <button onClick={runAgent} disabled={agentRunning || !agentQuery.trim()} style={{ width: '100%', padding: '10px 0', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: agentRunning || !agentQuery.trim() ? '#aaa' : '#111', color: '#fff', cursor: agentRunning || !agentQuery.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Play size={14} />
                {agentRunning ? 'Agent running…' : 'Run Now'}
              </button>

              <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
                <label style={labelStyle}>Schedule</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {(['daily', 'weekly'] as const).map(f => (
                    <button key={f} onClick={() => setSchedFreq(f)} style={{ flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 500, borderRadius: 6, border: '1px solid', borderColor: schedFreq === f ? '#111' : '#e5e5e5', background: schedFreq === f ? '#111' : '#fff', color: schedFreq === f ? '#fff' : '#555', cursor: 'pointer', textTransform: 'capitalize' }}>
                      {f}
                    </button>
                  ))}
                </div>
                <button onClick={scheduleAgent} disabled={scheduling || !agentQuery.trim()} style={{ width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 600, borderRadius: 7, border: '1px solid #e5e5e5', background: '#fff', color: scheduling || !agentQuery.trim() ? '#bbb' : '#555', cursor: scheduling || !agentQuery.trim() ? 'not-allowed' : 'pointer' }}>
                  {scheduling ? 'Scheduling…' : '📅 Save Schedule'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: '#f9f9f9' }}>

        {/* Criteria results */}
        {mode === 'criteria' && (
          <>
            {results.length === 0 && !loading && (
              <Placeholder icon={<Crosshair size={44} strokeWidth={1} />} text="Configure criteria and run a search" />
            )}
            {loading && <div style={{ textAlign: 'center', marginTop: 60, color: '#aaa', fontSize: 13 }}>Fetching from Netrows…</div>}
            {results.length > 0 && (
              <>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#555' }}>
                  <strong style={{ color: '#111' }}>{total.toLocaleString()}</strong> results · showing {results.length}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 12 }}>
                  {results.map((result, i) => {
                    const url    = isPerson(result) ? (result as PeopleResult).profileURL : (result as CompanyResult).linkedinURL
                    const saved  = savedUrls.has(url)
                    const saving = savingUrl === url
                    return <ResultCard key={url ?? i} result={result} saved={saved} saving={saving} onSave={() => saveResult(result)} />
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* URL lookup placeholder */}
        {mode === 'lookup' && !lookupResult && (
          <Placeholder icon={<Globe size={44} strokeWidth={1} />} text="Paste a LinkedIn URL to fetch and save a profile" />
        )}

        {/* AI Agent progress + schedules */}
        {mode === 'agent' && (
          <>
            {/* Progress steps */}
            {agentEvents.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#111' }}>Agent Progress</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {agentEvents.map((ev, i) => (
                    <div key={i} style={{ background: '#fff', border: '1px solid', borderColor: ev.status === 'error' ? '#fecaca' : ev.status === 'done' ? '#bbf7d0' : '#e5e5e5', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 20, flexShrink: 0 }}>
                        {ev.status === 'error' ? '❌' : ev.status === 'done' ? (ev.step === 4 ? '🎉' : '✅') : (STEP_ICONS[ev.step] ?? '⟳')}
                      </span>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: ev.status === 'error' ? '#991b1b' : '#111' }}>{ev.message}</p>
                        {ev.status === 'running' && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#aaa' }}>In progress…</p>}
                      </div>
                      {(ev.count ?? ev.leadsTotal) !== undefined && (
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#555', background: '#f4f4f5', padding: '2px 8px', borderRadius: 5 }}>
                          {ev.leadsTotal ?? ev.count}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {agentDone && (
                  <a href="/outbound/leads" style={{ display: 'inline-block', marginTop: 14, padding: '10px 20px', fontSize: 13, fontWeight: 600, borderRadius: 8, background: '#111', color: '#fff', textDecoration: 'none' }}>
                    View Leads in CRM →
                  </a>
                )}
              </div>
            )}

            {agentEvents.length === 0 && (
              <Placeholder icon={<Bot size={44} strokeWidth={1} />} text="Enter a target query and run the AI agent" />
            )}

            {/* Schedules list */}
            {schedules.length > 0 && (
              <div>
                <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#111' }}>
                  Active Schedules <span style={{ fontWeight: 400, color: '#aaa', fontSize: 12 }}>— runs daily at 07:00 SGT</span>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {schedules.map(s => (
                    <div key={s.id} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#111' }}>{s.query}</p>
                        <p style={{ margin: '3px 0 0', fontSize: 11, color: '#aaa' }}>
                          {s.frequency} · roles: {s.roles.join(', ')} · max {s.max_companies} co.
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#aaa' }}>
                          {s.runs_count} runs · {s.leads_last} leads last run · {s.last_run_at ? `last: ${new Date(s.last_run_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}` : 'never run'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <button
                          onClick={() => toggleSchedule(s.id, !s.is_active)}
                          style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, borderRadius: 5, border: '1px solid', borderColor: s.is_active ? '#16a34a' : '#e5e5e5', background: s.is_active ? '#f0fdf4' : '#fff', color: s.is_active ? '#16a34a' : '#888', cursor: 'pointer' }}
                        >
                          {s.is_active ? 'Active' : 'Paused'}
                        </button>
                        <button onClick={() => deleteSchedule(s.id)} style={{ padding: 6, borderRadius: 5, border: '1px solid #fecaca', background: '#fff', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Placeholder({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', color: '#ccc', gap: 12 }}>
      {icon}
      <p style={{ margin: 0, fontSize: 14, color: '#bbb' }}>{text}</p>
    </div>
  )
}
