'use client'

import { useState } from 'react'
import { Globe, SlidersHorizontal } from 'lucide-react'
import React from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

type Mode       = 'criteria' | 'lookup'
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
  { label: 'Financial Services',    value: '43' },
  { label: 'Insurance',             value: '44' },
  { label: 'Banking',               value: '45' },
  { label: 'Computer Software',     value: '4'  },
  { label: 'Management Consulting', value: '96' },
  { label: 'Accounting',            value: '41' },
]

const COMPANY_SIZES = [
  { label: '1–10',   value: 'A' }, { label: '11–50',  value: 'B' },
  { label: '51–200', value: 'C' }, { label: '201–500', value: 'D' },
  { label: '501–1k', value: 'E' }, { label: '1k–5k',   value: 'F' },
  { label: '5k–10k', value: 'G' }, { label: '10k+',    value: 'H' },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function isPerson(r: SearchResult): r is PeopleResult { return 'fullName' in r }

function getUrl(r: SearchResult) {
  return isPerson(r) ? (r as PeopleResult).profileURL : (r as CompanyResult).linkedinURL
}

function buildRecord(result: SearchResult) {
  if (isPerson(result)) {
    const r = result as PeopleResult
    return {
      record_type: 'person', source: 'people_search',
      linkedin_url: r.profileURL, username: r.username,
      full_name: r.fullName, headline: r.headline, summary: r.summary,
      profile_picture: r.profilePicture, location: r.location, raw_payload: result,
    }
  }
  const r = result as CompanyResult
  return {
    record_type: 'company', source: 'company_search',
    linkedin_id: r.id, linkedin_url: r.linkedinURL, username: r.universalName,
    full_name: r.name, headline: r.tagline, company_tagline: r.tagline,
    logo_url: r.logo, raw_payload: result,
  }
}

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

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ManualSearchPage() {
  const [mode,       setMode]       = useState<Mode>('criteria')
  const [searchType, setSearchType] = useState<SearchType>('people')
  const [loading,    setLoading]    = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [results,    setResults]    = useState<SearchResult[]>([])
  const [total,      setTotal]      = useState(0)
  const [hasMore,    setHasMore]    = useState(false)
  const [pageOffset, setPageOffset] = useState(0)
  const [savedUrls,  setSavedUrls]  = useState<Set<string>>(new Set())
  const [savingUrls, setSavingUrls] = useState<Set<string>>(new Set())
  const [checked,    setChecked]    = useState<Set<string>>(new Set())
  const [error,      setError]      = useState<string | null>(null)

  // Criteria — people
  const [keywordTitle,  setKeywordTitle]  = useState('')
  const [keywords,      setKeywords]      = useState('')
  const [geo,           setGeo]           = useState('102454443')
  const [company,       setCompany]       = useState('')

  // Criteria — company
  const [keyword,       setKeyword]       = useState('')
  const [locations,     setLocations]     = useState('102454443')
  const [selectedSizes, setSelectedSizes] = useState<string[]>(['B', 'C', 'D'])
  const [industries,    setIndustries]    = useState('43')
  const [hasJobs,       setHasJobs]       = useState(false)

  // URL lookup
  const [lookupUrl,     setLookupUrl]     = useState('')
  const [lookupResult,  setLookupResult]  = useState<SavedLead | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)

  // ── Search ───────────────────────────────────────────────────────────────

  async function runSearch(append = false, offset = 0) {
    if (append) setLoadingMore(true); else setLoading(true)
    setError(null)
    if (!append) { setResults([]); setChecked(new Set()); setPageOffset(0) }
    try {
      const body = searchType === 'people'
        ? { type: 'people', keywordTitle, keywords, geo, company, start: offset }
        : { type: 'company', keyword, locations, companySizes: selectedSizes.join(','), industries, hasJobs, page: offset + 1 }
      const res  = await fetch('/api/outbound/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Search failed'); return }

      // Normalize Netrows response — handles both { data: { items, total } } and { items, total }
      const wrapper = data.data ?? data
      const newItems: SearchResult[] = Array.isArray(wrapper.items)
        ? wrapper.items
        : Array.isArray(wrapper)
          ? wrapper
          : wrapper.item ? [wrapper.item] : []
      const newTotal = wrapper.total ?? wrapper.paging?.total ?? newItems.length

      setResults(prev => append ? [...prev, ...newItems] : newItems)
      setTotal(newTotal)
      setHasMore(newItems.length > 0 && (append ? results.length + newItems.length : newItems.length) < newTotal)
    } catch { setError('Network error') }
    finally { setLoading(false); setLoadingMore(false) }
  }

  async function loadMore() {
    const nextOffset = pageOffset + 10
    setPageOffset(nextOffset)
    await runSearch(true, nextOffset)
  }

  // ── Save helpers ─────────────────────────────────────────────────────────

  async function saveOne(result: SearchResult): Promise<boolean> {
    const url = getUrl(result)
    if (savedUrls.has(url)) return true
    setSavingUrls(prev => new Set([...Array.from(prev), url]))
    try {
      const res = await fetch('/api/outbound/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record: buildRecord(result) }),
      })
      if (res.ok) { setSavedUrls(prev => new Set([...Array.from(prev), url])); return true }
      return false
    } finally {
      setSavingUrls(prev => { const s = new Set(Array.from(prev)); s.delete(url); return s })
    }
  }

  async function saveSelected() {
    for (const result of results) {
      if (checked.has(getUrl(result))) await saveOne(result)
    }
  }

  async function saveAll() {
    for (const result of results) await saveOne(result)
  }

  // ── Checkbox helpers ──────────────────────────────────────────────────────

  const allChecked = results.length > 0 && results.every(r => checked.has(getUrl(r)))
  const checkedCount = Array.from(checked).filter(u => results.some(r => getUrl(r) === u)).length

  function toggleAll() {
    if (allChecked) setChecked(new Set())
    else setChecked(new Set(results.map(getUrl)))
  }

  function toggleOne(url: string) {
    setChecked(prev => {
      const s = new Set(Array.from(prev))
      if (s.has(url)) s.delete(url); else s.add(url)
      return s
    })
  }

  // ── URL Lookup ────────────────────────────────────────────────────────────

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

  // ── Render ─────────────────────────────────────────────────────────────────

  const unsavedChecked = checkedCount - Array.from(checked).filter(u => savedUrls.has(u)).length

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Left panel: form ── */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #e5e5e5', background: '#fff', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111', letterSpacing: '-0.02em' }}>Manual Search</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#aaa' }}>Find & save LinkedIn prospects</p>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e5e5', flexShrink: 0 }}>
          {(['criteria', 'lookup'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: '9px 0', fontSize: 11, fontWeight: mode === m ? 600 : 400,
              color: mode === m ? '#111' : '#888', background: 'none', border: 'none',
              borderBottom: mode === m ? '2px solid #111' : '2px solid transparent', cursor: 'pointer',
            }}>
              {m === 'criteria' ? 'Criteria Search' : 'URL Lookup'}
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
                    <label style={labelStyle}>Location</label>
                    <select value={locations} onChange={e => setLocations(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                      {LOCATIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Industry</label>
                    <select value={industries} onChange={e => setIndustries(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                      {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Company Size</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {COMPANY_SIZES.map(s => {
                        const on = selectedSizes.includes(s.value)
                        return (
                          <button key={s.value} onClick={() => setSelectedSizes(prev => on ? prev.filter(v => v !== s.value) : [...prev, s.value])} style={{ padding: '3px 9px', fontSize: 11, borderRadius: 5, border: '1px solid', borderColor: on ? '#111' : '#e5e5e5', background: on ? '#111' : '#fff', color: on ? '#fff' : '#555', cursor: 'pointer' }}>
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

              <button onClick={() => runSearch(false, 0)} disabled={loading} style={{ marginTop: 20, width: '100%', padding: '10px 0', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: loading ? '#aaa' : '#111', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer' }}>
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
        </div>
      </div>

      {/* ── Right panel: results table ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f9f9f9' }}>

        {/* URL lookup empty state */}
        {mode === 'lookup' && !lookupResult && (
          <Placeholder icon={<Globe size={44} strokeWidth={1} />} text="Paste a LinkedIn URL on the left to fetch and save a profile" />
        )}

        {/* Criteria results */}
        {mode === 'criteria' && (
          <>
            {results.length === 0 && !loading && (
              <Placeholder icon={<SlidersHorizontal size={44} strokeWidth={1} />} text="Configure search criteria and click Run Search" />
            )}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#aaa', fontSize: 13 }}>
                Fetching from Netrows…
              </div>
            )}

            {results.length > 0 && (
              <>
                {/* Toolbar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', background: '#fff', borderBottom: '1px solid #e5e5e5', flexShrink: 0 }}>
                  <span style={{ fontSize: 13, color: '#555', flex: 1 }}>
                    <strong style={{ color: '#111' }}>{total.toLocaleString()}</strong> total · <strong style={{ color: '#111' }}>{results.length}</strong> loaded
                  </span>
                  <button
                    onClick={saveSelected}
                    disabled={unsavedChecked === 0}
                    style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 7, border: '1px solid #e5e5e5', background: unsavedChecked > 0 ? '#111' : '#f4f4f5', color: unsavedChecked > 0 ? '#fff' : '#bbb', cursor: unsavedChecked > 0 ? 'pointer' : 'default' }}
                  >
                    Save Selected {checkedCount > 0 ? `(${checkedCount})` : ''}
                  </button>
                  <button
                    onClick={saveAll}
                    disabled={results.every(r => savedUrls.has(getUrl(r)))}
                    style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 7, border: '1px solid #e5e5e5', background: '#fff', color: '#111', cursor: 'pointer' }}
                  >
                    Save All ({results.length})
                  </button>
                </div>

                {/* Table */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#fff', borderBottom: '1px solid #e5e5e5', position: 'sticky', top: 0, zIndex: 1 }}>
                        <th style={{ width: 44, padding: '10px 0 10px 16px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={toggleAll}
                            style={{ cursor: 'pointer', width: 15, height: 15 }}
                          />
                        </th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {searchType === 'people' ? 'Person' : 'Company'}
                        </th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', width: '35%' }}>
                          {searchType === 'people' ? 'Headline' : 'Tagline'}
                        </th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', width: 140 }}>
                          {searchType === 'people' ? 'Location' : ''}
                        </th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', width: 100 }}>
                          LinkedIn
                        </th>
                        <th style={{ padding: '10px 16px 10px 12px', textAlign: 'center', fontWeight: 600, color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', width: 80 }}>
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((result, i) => {
                        const url    = getUrl(result)
                        const person = isPerson(result)
                        const name   = person ? (result as PeopleResult).fullName  : (result as CompanyResult).name
                        const sub    = person ? (result as PeopleResult).headline  : (result as CompanyResult).tagline
                        const loc    = person ? (result as PeopleResult).location  : null
                        const pic    = person ? (result as PeopleResult).profilePicture : (result as CompanyResult).logo
                        const isSaved   = savedUrls.has(url)
                        const isSaving  = savingUrls.has(url)
                        const isChecked = checked.has(url)

                        return (
                          <tr key={url ?? i} style={{ borderBottom: '1px solid #f0f0f0', background: isChecked ? '#f8f8ff' : '#fff', transition: 'background 0.1s' }}>
                            <td style={{ width: 44, padding: '10px 0 10px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleOne(url)}
                                style={{ cursor: 'pointer', width: 15, height: 15 }}
                              />
                            </td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {pic ? (
                                  <img src={pic} alt="" style={{ width: 34, height: 34, borderRadius: person ? '50%' : 6, objectFit: 'cover', flexShrink: 0, background: '#f4f4f5' }} />
                                ) : (
                                  <div style={{ width: 34, height: 34, borderRadius: person ? '50%' : 6, background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>
                                    {person ? '👤' : '🏢'}
                                  </div>
                                )}
                                <span style={{ fontWeight: 500, color: '#111', lineHeight: 1.3 }}>{name || '—'}</span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle', color: '#555', lineHeight: 1.4, maxWidth: 0 }}>
                              <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {sub || '—'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle', color: '#888', fontSize: 12, whiteSpace: 'nowrap' }}>
                              {loc || '—'}
                            </td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                              {url ? (
                                <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#0a66c2', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                  View ↗
                                </a>
                              ) : '—'}
                            </td>
                            <td style={{ padding: '10px 16px 10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                              {isSaved ? (
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', background: '#f0fdf4', padding: '3px 8px', borderRadius: 5 }}>Saved</span>
                              ) : isSaving ? (
                                <span style={{ fontSize: 11, color: '#aaa' }}>…</span>
                              ) : (
                                <button
                                  onClick={() => saveOne(result)}
                                  style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: '1px solid #e5e5e5', background: '#fff', color: '#555', cursor: 'pointer' }}
                                >
                                  Save
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {/* Load More */}
                  {hasMore && (
                    <div style={{ padding: '16px 20px', textAlign: 'center' }}>
                      <button
                        onClick={loadMore}
                        disabled={loadingMore}
                        style={{ padding: '8px 24px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid #e5e5e5', background: '#fff', color: '#555', cursor: loadingMore ? 'not-allowed' : 'pointer' }}
                      >
                        {loadingMore ? 'Loading…' : `Load More (${total - results.length} remaining)`}
                      </button>
                    </div>
                  )}

                  {!hasMore && results.length > 0 && (
                    <p style={{ textAlign: 'center', padding: '16px 20px', fontSize: 12, color: '#bbb', margin: 0 }}>
                      All {results.length} results loaded
                    </p>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Placeholder({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#ccc', gap: 12 }}>
      {icon}
      <p style={{ margin: 0, fontSize: 14, color: '#bbb' }}>{text}</p>
    </div>
  )
}
