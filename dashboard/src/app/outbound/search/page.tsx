'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Globe, Mail, Copy, Check, Users, User, Building2 } from 'lucide-react'
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

interface EmailEntry { email: string; status: string }
type EmailState = EmailEntry | 'fetching' | 'not_found'

interface PersonLookupResult {
  found: boolean; name: string | null; email?: string | null
  email_status?: string; headline?: string | null
  company?: string | null; profile_picture?: string | null; lead_id?: string | null
}
type EmployeeEmailState = { found: boolean; email?: string; lead_id?: string | null } | 'fetching' | 'not_found'
interface LookupHistoryEntry {
  url: string; type: 'person' | 'company'; name: string | null; email?: string; timestamp: number
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

function detectUrlType(url: string): 'person' | 'company' | null {
  if (url.includes('/in/')) return 'person'
  if (url.includes('/company/')) return 'company'
  return null
}

function extractCompanySlug(url: string): string {
  const m = url.match(/\/company\/([^/?#]+)/)
  return m ? m[1] : ''
}

function slugToDisplayName(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function buildRecord(result: SearchResult, email?: string) {
  if (isPerson(result)) {
    const r = result as PeopleResult
    return {
      record_type: 'person', source: 'people_search',
      linkedin_url: r.profileURL, username: r.username,
      full_name: r.fullName, headline: r.headline, summary: r.summary,
      profile_picture: r.profilePicture, location: r.location,
      ...(email ? { email, email_status: 'valid' } : {}),
      raw_payload: result,
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

// ── localStorage helpers ───────────────────────────────────────────────────

const HISTORY_KEY = 'obs_lookup_history'

function loadHistory(): LookupHistoryEntry[] {
  try { const raw = localStorage.getItem(HISTORY_KEY); return raw ? JSON.parse(raw) : [] }
  catch { return [] }
}
function saveHistory(entries: LookupHistoryEntry[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(entries)) } catch {}
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
  const [mode,        setMode]        = useState<Mode>('criteria')
  const [searchType,  setSearchType]  = useState<SearchType>('people')
  const [loading,     setLoading]     = useState(false)
  const [autoLoading, setAutoLoading] = useState(false)
  const [autoLoaded,  setAutoLoaded]  = useState(0)
  const [results,     setResults]     = useState<SearchResult[]>([])
  const [total,       setTotal]       = useState(0)
  const [savedUrls,   setSavedUrls]   = useState<Set<string>>(new Set())
  const [savingUrls,  setSavingUrls]  = useState<Set<string>>(new Set())
  const [checked,     setChecked]     = useState<Set<string>>(new Set())
  const [crmUrls,     setCrmUrls]     = useState<Set<string>>(new Set())
  const [emailMap,    setEmailMap]    = useState<Record<string, EmailState>>({})
  const [findingAll,  setFindingAll]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [copiedUrl,   setCopiedUrl]   = useState<string | null>(null)
  const [employeeContext, setEmployeeContext] = useState<{ name: string; url: string } | null>(null)

  const stopAutoLoad = useRef(false)
  const stopEmailAll = useRef(false)

  // People-only fields
  const [keywordTitle, setKeywordTitle] = useState('')
  const [keywords,     setKeywords]     = useState('')
  const [geo,          setGeo]          = useState('102454443')
  const [company,      setCompany]      = useState('')

  // Company-only fields
  const [keyword,       setKeyword]       = useState('')
  const [locations,     setLocations]     = useState('102454443')
  const [selectedSizes, setSelectedSizes] = useState<string[]>(['B', 'C', 'D'])
  const [industries,    setIndustries]    = useState('43')
  const [hasJobs,       setHasJobs]       = useState(false)

  // URL lookup state
  const [lookupUrl,            setLookupUrl]            = useState('')
  const [lookupLoading,        setLookupLoading]        = useState(false)
  const [lookupPersonResult,   setLookupPersonResult]   = useState<PersonLookupResult | null>(null)
  const [lookupCompanyName,    setLookupCompanyName]    = useState<string | null>(null)
  const [lookupEmployees,      setLookupEmployees]      = useState<PeopleResult[]>([])
  const [lookupEmployeeTotal,  setLookupEmployeeTotal]  = useState(0)
  const [lookupEmployeeEmailMap, setLookupEmployeeEmailMap] = useState<Record<string, EmployeeEmailState>>({})
  const [lookupError,          setLookupError]          = useState<string | null>(null)
  const [lookupHistory,        setLookupHistory]        = useState<LookupHistoryEntry[]>([])

  const detectedUrlType = useMemo(() => detectUrlType(lookupUrl), [lookupUrl])

  // ── Restore session on mount ─────────────────────────────────────────────

  useEffect(() => {
    setLookupHistory(loadHistory())
    try {
      const lastType = (sessionStorage.getItem('obs_last_type') ?? 'people') as SearchType
      setSearchType(lastType)
      const raw = sessionStorage.getItem(`obs_${lastType}`)
      if (raw) {
        const s = JSON.parse(raw)
        if (Array.isArray(s.results) && s.results.length > 0) {
          setResults(s.results)
          setTotal(s.total ?? s.results.length)
          const em: Record<string, EmailState> = {}
          for (const [k, v] of Object.entries(s.emailMap ?? {})) {
            if (v !== 'fetching') em[k] = v as EmailState
          }
          setEmailMap(em)
          setSavedUrls(new Set(s.savedUrls ?? []))
        }
      }
      const personRaw = sessionStorage.getItem('obs_lookup_person')
      if (personRaw) {
        const p = JSON.parse(personRaw)
        setLookupUrl(p.url ?? '')
        setLookupPersonResult(p.result ?? null)
      }
    } catch {}
  }, [])

  // Persist criteria results
  useEffect(() => {
    if (results.length === 0) return
    try {
      sessionStorage.setItem(`obs_${searchType}`, JSON.stringify({
        results, total,
        emailMap: Object.fromEntries(Object.entries(emailMap).filter(([, v]) => v !== 'fetching')),
        savedUrls: Array.from(savedUrls),
      }))
      sessionStorage.setItem('obs_last_type', searchType)
    } catch {}
  }, [results, total, searchType, emailMap, savedUrls])

  // Persist person lookup result
  useEffect(() => {
    if (!lookupPersonResult) return
    try {
      sessionStorage.setItem('obs_lookup_person', JSON.stringify({ url: lookupUrl, result: lookupPersonResult }))
    } catch {}
  }, [lookupPersonResult, lookupUrl])

  // ── Load CRM linkedin_urls ────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/outbound/leads?urls=true')
      .then(r => r.ok ? r.json() : [])
      .then((rows: { linkedin_url?: string | null }[]) => {
        setCrmUrls(new Set(rows.map(r => r.linkedin_url).filter((u): u is string => Boolean(u))))
      })
      .catch(() => {})
  }, [])

  // ── Criteria search ───────────────────────────────────────────────────────

  async function fetchPage(offset: number): Promise<{ items: SearchResult[]; total: number }> {
    const body = searchType === 'people'
      ? { type: 'people', keywordTitle, keywords, geo, company, start: offset }
      : { type: 'company', keyword, locations, companySizes: selectedSizes.join(','), industries, hasJobs, page: Math.floor(offset / 10) + 1 }
    const res = await fetch('/api/outbound/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) return { items: [], total: 0 }
    const data    = await res.json()
    const wrapper = data.data ?? data
    const items: SearchResult[] = Array.isArray(wrapper.items) ? wrapper.items
      : Array.isArray(wrapper) ? wrapper
      : wrapper.item ? [wrapper.item] : []
    return { items, total: wrapper.total ?? wrapper.paging?.total ?? items.length }
  }

  async function runSearch() {
    sessionStorage.removeItem(`obs_${searchType}`)
    stopAutoLoad.current = true
    setLoading(true); setError(null); setEmployeeContext(null)
    setResults([]); setChecked(new Set()); setAutoLoaded(0); setEmailMap({}); setSavedUrls(new Set())
    try {
      const first = await fetchPage(0)
      stopAutoLoad.current = false
      setResults(first.items); setTotal(first.total); setLoading(false)
      if (first.items.length > 0 && first.items.length < first.total) {
        setAutoLoading(true)
        let loaded = first.items.length, offset = 10
        while (loaded < first.total && !stopAutoLoad.current) {
          const page = await fetchPage(offset)
          if (page.items.length === 0) break
          setResults(prev => {
            const existing = new Set(prev.map(getUrl))
            return [...prev, ...page.items.filter(r => !existing.has(getUrl(r)))]
          })
          loaded += page.items.length; setAutoLoaded(loaded); offset += 10
        }
        setAutoLoading(false)
      }
    } catch { setError('Network error'); setLoading(false); setAutoLoading(false) }
  }

  // ── Email finder (criteria mode) ──────────────────────────────────────────

  async function findEmail(result: SearchResult) {
    if (!isPerson(result)) return
    const url = getUrl(result)
    if (emailMap[url] && emailMap[url] !== 'not_found') return
    setEmailMap(prev => ({ ...prev, [url]: 'fetching' }))
    try {
      const res  = await fetch('/api/outbound/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedin_url: url }),
      })
      const data = await res.json()
      const entry: EmailState = data.found ? { email: data.email, status: data.email_status } : 'not_found'
      setEmailMap(prev => ({ ...prev, [url]: entry }))
      if (data.found && !savedUrls.has(url) && !crmUrls.has(url)) await saveOne(result, data.email)
    } catch { setEmailMap(prev => ({ ...prev, [url]: 'not_found' })) }
  }

  async function runEmailBatch(targets: SearchResult[]) {
    if (targets.length === 0) return
    if (!confirm(`Find emails for ${targets.length} ${targets.length === 1 ? 'person' : 'people'}?\n~${targets.length * 5} Netrows credits. Proceed?`)) return
    setFindingAll(true); stopEmailAll.current = false
    for (const result of targets) {
      if (stopEmailAll.current) break
      await findEmail(result)
    }
    setFindingAll(false)
  }
  function findAllEmails()       { return runEmailBatch(results.filter(r => isPerson(r) && !emailMap[getUrl(r)])) }
  function findEmailsForSelected() { return runEmailBatch(results.filter(r => isPerson(r) && checked.has(getUrl(r)) && !emailMap[getUrl(r)])) }

  // ── Save helpers ──────────────────────────────────────────────────────────

  async function saveOne(result: SearchResult, overrideEmail?: string): Promise<void> {
    const url = getUrl(result)
    if (savedUrls.has(url) || crmUrls.has(url)) return
    setSavingUrls(prev => new Set([...Array.from(prev), url]))
    try {
      const emailEntry = emailMap[url]
      const email = overrideEmail ?? (emailEntry && typeof emailEntry === 'object' ? emailEntry.email : undefined)
      const res = await fetch('/api/outbound/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record: buildRecord(result, email) }),
      })
      if (res.ok) { setSavedUrls(prev => new Set([...Array.from(prev), url])); setCrmUrls(prev => new Set([...Array.from(prev), url])) }
    } finally { setSavingUrls(prev => { const s = new Set(Array.from(prev)); s.delete(url); return s }) }
  }

  async function saveSelected() {
    for (const r of results)
      if (checked.has(getUrl(r)) && !savedUrls.has(getUrl(r)) && !crmUrls.has(getUrl(r))) await saveOne(r)
  }
  async function saveAll() {
    for (const r of results)
      if (!savedUrls.has(getUrl(r)) && !crmUrls.has(getUrl(r))) await saveOne(r)
  }

  // ── Company employee search (criteria mode) ───────────────────────────────

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(url); setTimeout(() => setCopiedUrl(u => u === url ? null : u), 1500)
    }).catch(() => {})
  }

  function saveTypeSession() {
    if (results.length === 0) return
    try {
      sessionStorage.setItem(`obs_${searchType}`, JSON.stringify({
        results, total,
        emailMap: Object.fromEntries(Object.entries(emailMap).filter(([, v]) => v !== 'fetching')),
        savedUrls: Array.from(savedUrls),
      }))
    } catch {}
  }
  function restoreTypeSession(t: SearchType) {
    try {
      const raw = sessionStorage.getItem(`obs_${t}`)
      if (raw) {
        const s = JSON.parse(raw)
        setResults(s.results ?? []); setTotal(s.total ?? 0)
        const em: Record<string, EmailState> = {}
        for (const [k, v] of Object.entries(s.emailMap ?? {})) if (v !== 'fetching') em[k] = v as EmailState
        setEmailMap(em); setSavedUrls(new Set(s.savedUrls ?? []))
        return true
      }
    } catch {}
    return false
  }

  function switchType(t: SearchType) {
    if (t === searchType) return
    saveTypeSession(); stopAutoLoad.current = true; setEmployeeContext(null); setChecked(new Set())
    const restored = restoreTypeSession(t)
    if (!restored) { setResults([]); setTotal(0); setEmailMap({}); setSavedUrls(new Set()) }
    setSearchType(t); sessionStorage.setItem('obs_last_type', t)
  }

  function backToCompanySearch() {
    stopAutoLoad.current = true; setEmployeeContext(null); setChecked(new Set())
    const restored = restoreTypeSession('company')
    if (!restored) { setResults([]); setTotal(0); setEmailMap({}); setSavedUrls(new Set()) }
    setSearchType('company'); sessionStorage.setItem('obs_last_type', 'company')
  }

  async function searchEmployees(co: CompanyResult) {
    saveTypeSession()
    setEmployeeContext({ name: co.name, url: co.linkedinURL })
    setSearchType('people'); sessionStorage.setItem('obs_last_type', 'people')
    stopAutoLoad.current = true; setLoading(true); setError(null)
    setResults([]); setChecked(new Set()); setAutoLoaded(0); setEmailMap({}); setSavedUrls(new Set())
    const fetchEmpPage = async (start: number): Promise<{ items: SearchResult[]; total: number }> => {
      const res = await fetch('/api/outbound/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'people', company: co.name, start }),
      })
      if (!res.ok) return { items: [], total: 0 }
      const data = await res.json(); const wrapper = data.data ?? data
      const items: SearchResult[] = Array.isArray(wrapper.items) ? wrapper.items
        : Array.isArray(wrapper) ? wrapper : wrapper.item ? [wrapper.item] : []
      return { items, total: wrapper.total ?? wrapper.paging?.total ?? items.length }
    }
    try {
      const first = await fetchEmpPage(0)
      stopAutoLoad.current = false; setResults(first.items); setTotal(first.total); setLoading(false)
      if (first.items.length > 0 && first.items.length < first.total) {
        setAutoLoading(true)
        let loaded = first.items.length, offset = 10
        while (loaded < first.total && !stopAutoLoad.current) {
          const page = await fetchEmpPage(offset)
          if (page.items.length === 0) break
          setResults(prev => { const existing = new Set(prev.map(getUrl)); return [...prev, ...page.items.filter(r => !existing.has(getUrl(r)))] })
          loaded += page.items.length; setAutoLoaded(loaded); offset += 10
        }
        setAutoLoading(false)
      }
    } catch { setError('Network error'); setLoading(false); setAutoLoading(false) }
  }

  // ── URL Lookup ────────────────────────────────────────────────────────────

  function addToLookupHistory(entry: LookupHistoryEntry) {
    const updated = [entry, ...loadHistory().filter(h => h.url !== entry.url)].slice(0, 20)
    saveHistory(updated); setLookupHistory(updated)
  }

  async function runPersonGenerate() {
    if (!lookupUrl.trim()) return
    setLookupLoading(true); setLookupPersonResult(null); setLookupError(null)
    sessionStorage.removeItem('obs_lookup_person')
    try {
      const res  = await fetch('/api/outbound/generate-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: lookupUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setLookupError(data.error ?? 'Failed'); return }
      setLookupPersonResult(data)
      addToLookupHistory({ url: lookupUrl.trim(), type: 'person', name: data.name, email: data.found ? data.email : undefined, timestamp: Date.now() })
    } catch { setLookupError('Network error') }
    finally   { setLookupLoading(false) }
  }

  async function runCompanyEmployees() {
    if (!lookupUrl.trim()) return
    const slug = extractCompanySlug(lookupUrl.trim())
    if (!slug) { setLookupError('Could not extract company slug from URL'); return }
    setLookupLoading(true); setLookupCompanyName(null)
    setLookupEmployees([]); setLookupEmployeeTotal(0); setLookupEmployeeEmailMap({}); setLookupError(null)
    try {
      // Fetch company name (also saves company to outbound_leads)
      const lookupRes = await fetch('/api/outbound/lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: lookupUrl.trim() }),
      })
      const lookupData = await lookupRes.json()
      const companyName = lookupData.lead?.full_name ?? slugToDisplayName(slug)
      setLookupCompanyName(companyName)
      // Search employees by company name
      const searchRes = await fetch('/api/outbound/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'people', company: companyName, start: 0 }),
      })
      const searchData = await searchRes.json()
      const wrapper = searchData.data ?? searchData
      const employees: PeopleResult[] = Array.isArray(wrapper.items) ? wrapper.items
        : Array.isArray(wrapper) ? wrapper : wrapper.item ? [wrapper.item] : []
      setLookupEmployees(employees)
      setLookupEmployeeTotal(wrapper.total ?? wrapper.paging?.total ?? employees.length)
      addToLookupHistory({ url: lookupUrl.trim(), type: 'company', name: companyName, timestamp: Date.now() })
    } catch { setLookupError('Network error') }
    finally   { setLookupLoading(false) }
  }

  async function generateEmailForEmployee(person: PeopleResult) {
    const url = person.profileURL
    if (!url) return
    const current = lookupEmployeeEmailMap[url]
    if (current && current !== 'not_found') return
    setLookupEmployeeEmailMap(prev => ({ ...prev, [url]: 'fetching' }))
    try {
      const res  = await fetch('/api/outbound/generate-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      setLookupEmployeeEmailMap(prev => ({
        ...prev,
        [url]: data.found ? { found: true, email: data.email, lead_id: data.lead_id } : 'not_found',
      }))
    } catch { setLookupEmployeeEmailMap(prev => ({ ...prev, [url]: 'not_found' })) }
  }

  function runLookup() {
    if (detectedUrlType === 'person') runPersonGenerate()
    else if (detectedUrlType === 'company') runCompanyEmployees()
  }

  function loadHistoryEntry(entry: LookupHistoryEntry) {
    setLookupUrl(entry.url); setLookupError(null)
    setLookupPersonResult(null); setLookupEmployees([]); setLookupCompanyName(null); setLookupEmployeeEmailMap({})
    setMode('lookup')
  }

  // ── Checkbox helpers ──────────────────────────────────────────────────────

  const allChecked                = results.length > 0 && results.every(r => checked.has(getUrl(r)))
  const checkedCount              = results.filter(r => checked.has(getUrl(r))).length
  const newSelected               = results.filter(r => checked.has(getUrl(r)) && !savedUrls.has(getUrl(r)) && !crmUrls.has(getUrl(r))).length
  const newTotal                  = results.filter(r => !savedUrls.has(getUrl(r)) && !crmUrls.has(getUrl(r))).length
  const dupCount                  = results.filter(r => crmUrls.has(getUrl(r))).length
  const peopleCount               = results.filter(r => isPerson(r)).length
  const emailPending              = results.filter(r => isPerson(r) && !emailMap[getUrl(r)]).length
  const checkedPeopleWithoutEmail = results.filter(r => isPerson(r) && checked.has(getUrl(r)) && !emailMap[getUrl(r)]).length

  function toggleAll()           { setChecked(allChecked ? new Set() : new Set(results.map(getUrl))) }
  function toggleOne(u: string)  { setChecked(prev => { const s = new Set(Array.from(prev)); s.has(u) ? s.delete(u) : s.add(u); return s }) }

  const showEmailCol = mode === 'criteria' && searchType === 'people'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Left panel ── */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #e5e5e5', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111', letterSpacing: '-0.02em' }}>Manual Search</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#aaa' }}>Find & save LinkedIn prospects</p>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #e5e5e5', flexShrink: 0 }}>
          {(['criteria', 'lookup'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: '9px 0', fontSize: 11, fontWeight: mode === m ? 600 : 400, color: mode === m ? '#111' : '#888', background: 'none', border: 'none', borderBottom: mode === m ? '2px solid #111' : '2px solid transparent', cursor: 'pointer' }}>
              {m === 'criteria' ? 'Criteria Search' : 'URL Lookup'}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Criteria form ── */}
          {mode === 'criteria' && (
            <>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['people', 'company'] as SearchType[]).map(t => (
                  <button key={t} onClick={() => switchType(t)} style={{ flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 500, borderRadius: 7, border: '1px solid', borderColor: searchType === t ? '#111' : '#e5e5e5', background: searchType === t ? '#111' : '#fff', color: searchType === t ? '#fff' : '#555', cursor: 'pointer' }}>
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

              {error && <div style={{ padding: '8px 12px', background: '#fef2f2', borderRadius: 7, fontSize: 12, color: '#991b1b' }}>{error}</div>}

              <button onClick={runSearch} disabled={loading} style={{ width: '100%', padding: '10px 0', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: loading ? '#aaa' : '#111', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Searching…' : 'Run Search →'}
              </button>
            </>
          )}

          {/* ── URL Lookup form ── */}
          {mode === 'lookup' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={labelStyle}>LinkedIn URL</label>
                  <input
                    value={lookupUrl}
                    onChange={e => { setLookupUrl(e.target.value); setLookupError(null) }}
                    placeholder="linkedin.com/in/... or /company/..."
                    style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }}
                    onKeyDown={e => e.key === 'Enter' && runLookup()}
                  />
                  <div style={{ marginTop: 5 }}>
                    {lookupUrl.trim() && detectedUrlType === 'person' && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: '#0a66c2', background: '#eff6ff', padding: '2px 8px', borderRadius: 20 }}>
                        <User size={10} /> Person
                      </span>
                    )}
                    {lookupUrl.trim() && detectedUrlType === 'company' && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: '#7c3aed', background: '#f5f3ff', padding: '2px 8px', borderRadius: 20 }}>
                        <Building2 size={10} /> Company
                      </span>
                    )}
                    {lookupUrl.trim() && !detectedUrlType && (
                      <span style={{ fontSize: 10, color: '#e57373' }}>Unrecognised URL — paste a /in/ or /company/ link</span>
                    )}
                    {!lookupUrl.trim() && (
                      <span style={{ fontSize: 11, color: '#ccc' }}>Works for /in/ (person) or /company/ URLs</span>
                    )}
                  </div>
                </div>

                {lookupError && (
                  <div style={{ padding: '8px 12px', background: '#fef2f2', borderRadius: 7, fontSize: 12, color: '#991b1b' }}>{lookupError}</div>
                )}

                <button
                  onClick={runLookup}
                  disabled={lookupLoading || !lookupUrl.trim() || !detectedUrlType}
                  style={{
                    width: '100%', padding: '10px 0', fontSize: 13, fontWeight: 600,
                    borderRadius: 8, border: 'none',
                    background: (lookupLoading || !lookupUrl.trim() || !detectedUrlType) ? '#aaa' : '#111',
                    color: '#fff',
                    cursor: (lookupLoading || !lookupUrl.trim() || !detectedUrlType) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {lookupLoading
                    ? (detectedUrlType === 'company' ? 'Loading Employees…' : 'Generating…')
                    : detectedUrlType === 'company' ? 'View Employees →'
                    : detectedUrlType === 'person'  ? 'Generate Email →'
                    : 'Lookup →'}
                </button>
              </div>

              {/* History */}
              {lookupHistory.length > 0 && (
                <div>
                  <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: '#aaa', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Recent Lookups</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {lookupHistory.map((entry, i) => (
                      <button
                        key={i}
                        onClick={() => loadHistoryEntry(entry)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 8px', borderRadius: 7, border: 'none',
                          background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f9f9f9')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{
                          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                          background: entry.type === 'person' ? '#eff6ff' : '#f5f3ff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: entry.type === 'person' ? '#0a66c2' : '#7c3aed',
                        }}>
                          {entry.type === 'person' ? <User size={12} /> : <Building2 size={12} />}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: '#333', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.name ?? 'Unknown'}
                          </p>
                          {entry.email
                            ? <p style={{ margin: 0, fontSize: 10, color: '#16a34a', lineHeight: 1.3 }}>{entry.email}</p>
                            : <p style={{ margin: 0, fontSize: 10, color: '#ccc', lineHeight: 1.3 }}>No email found</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f9f9f9' }}>

        {/* ── Criteria mode ── */}
        {mode === 'criteria' && (
          <>
            {employeeContext && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: '#eef2ff', borderBottom: '1px solid #c7d2fe', flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: '#4338ca', fontWeight: 500 }}>Employees of {employeeContext.name}</span>
                <button onClick={backToCompanySearch} style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#4338ca', background: '#fff', border: '1px solid #c7d2fe', borderRadius: 5, padding: '3px 10px', cursor: 'pointer' }}>
                  ← Back to Companies
                </button>
              </div>
            )}
            {results.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#fff', borderBottom: '1px solid #e5e5e5', flexShrink: 0, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#555', flex: 1, minWidth: 120 }}>
                  <strong style={{ color: '#111' }}>{results.length}</strong>
                  {total > results.length ? ` / ${total.toLocaleString()}` : ` of ${total.toLocaleString()}`}
                  {autoLoading && <span style={{ marginLeft: 8, fontSize: 11, color: '#f59e0b' }}>● loading…</span>}
                  {dupCount > 0 && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#6366f1' }}>{dupCount} in CRM</span>}
                </span>
                {searchType === 'people' && checkedPeopleWithoutEmail > 0 && (
                  <button onClick={findEmailsForSelected} disabled={findingAll} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 7, border: '1px solid #111', background: findingAll ? '#f4f4f5' : '#111', color: findingAll ? '#bbb' : '#fff', cursor: findingAll ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                    <Mail size={13} />{findingAll ? 'Finding…' : `Find Email (${checkedPeopleWithoutEmail})`}
                  </button>
                )}
                {searchType === 'people' && emailPending > 0 && (
                  <button onClick={findAllEmails} disabled={findingAll} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 7, border: '1px solid #e5e5e5', background: findingAll ? '#f4f4f5' : '#fff', color: findingAll ? '#bbb' : '#555', cursor: findingAll ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                    <Mail size={13} />{findingAll ? 'Finding emails…' : `Find All (${emailPending} × 5 cr)`}
                  </button>
                )}
                <button onClick={saveSelected} disabled={newSelected === 0} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 7, border: '1px solid', borderColor: newSelected > 0 ? '#111' : '#e5e5e5', background: newSelected > 0 ? '#111' : '#f4f4f5', color: newSelected > 0 ? '#fff' : '#bbb', cursor: newSelected > 0 ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                  Save Selected {checkedCount > 0 ? `(${checkedCount})` : ''}
                </button>
                <button onClick={saveAll} disabled={newTotal === 0} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 7, border: '1px solid #e5e5e5', background: '#fff', color: newTotal > 0 ? '#111' : '#bbb', cursor: newTotal > 0 ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                  Save All {newTotal > 0 ? `(${newTotal})` : ''}
                </button>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: showEmailCol ? 900 : 700 }}>
                <thead>
                  <tr style={{ background: '#fff', borderBottom: '1px solid #e5e5e5', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ width: 44, padding: '10px 0 10px 16px', textAlign: 'center' }}>
                      <input type="checkbox" checked={allChecked} onChange={toggleAll} disabled={results.length === 0} style={{ cursor: results.length > 0 ? 'pointer' : 'default', width: 15, height: 15, opacity: results.length === 0 ? 0.3 : 1 }} />
                    </th>
                    <Th>{searchType === 'people' ? 'Person' : 'Company'}</Th>
                    <Th w="30%">{searchType === 'people' ? 'Headline' : 'Tagline'}</Th>
                    <Th w={120}>{searchType === 'people' ? 'Location' : 'LinkedIn URL'}</Th>
                    {showEmailCol && <Th w={200}>Email</Th>}
                    <Th w={searchType === 'company' ? 140 : 70}>{searchType === 'people' ? 'LinkedIn' : 'Employees'}</Th>
                    <Th w={110} center>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, i) => {
                    const url      = getUrl(result)
                    const person   = isPerson(result)
                    const name     = person ? (result as PeopleResult).fullName  : (result as CompanyResult).name
                    const sub      = person ? (result as PeopleResult).headline  : (result as CompanyResult).tagline
                    const loc      = person ? (result as PeopleResult).location  : null
                    const pic      = person ? (result as PeopleResult).profilePicture : (result as CompanyResult).logo
                    const inCrm    = crmUrls.has(url)
                    const isSaved  = savedUrls.has(url)
                    const isSaving = savingUrls.has(url)
                    const isChecked   = checked.has(url)
                    const emailState  = emailMap[url]
                    return (
                      <React.Fragment key={url ?? i}>
                        <tr style={{ borderBottom: '1px solid #f0f0f0', background: inCrm ? '#fafafa' : isChecked ? '#f8f8ff' : '#fff' }}>
                          <td style={{ width: 44, padding: '10px 0 10px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                            <input type="checkbox" checked={isChecked} onChange={() => toggleOne(url)} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                          </td>
                          <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {pic ? (
                                <img src={pic} alt="" style={{ width: 34, height: 34, borderRadius: person ? '50%' : 6, objectFit: 'cover', flexShrink: 0, opacity: inCrm ? 0.5 : 1 }} />
                              ) : (
                                <div style={{ width: 34, height: 34, borderRadius: person ? '50%' : 6, background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16, opacity: inCrm ? 0.5 : 1 }}>
                                  {person ? '👤' : '🏢'}
                                </div>
                              )}
                              <span style={{ fontWeight: 500, color: inCrm ? '#999' : '#111', lineHeight: 1.3 }}>{name || '—'}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', verticalAlign: 'middle', color: inCrm ? '#ccc' : '#555', lineHeight: 1.4, maxWidth: 0 }}>
                            <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{sub || '—'}</span>
                          </td>
                          <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontSize: 12, whiteSpace: 'nowrap' }}>
                            {person ? (
                              <span style={{ color: '#aaa' }}>{loc || '—'}</span>
                            ) : (
                              <button onClick={() => copyUrl(url)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 5, border: '1px solid #e5e5e5', background: copiedUrl === url ? '#f0fdf4' : '#fff', color: copiedUrl === url ? '#16a34a' : '#555', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                {copiedUrl === url ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy URL</>}
                              </button>
                            )}
                          </td>
                          {showEmailCol && (
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                              {!person ? (
                                <span style={{ fontSize: 12, color: '#ddd' }}>N/A</span>
                              ) : emailState === 'fetching' ? (
                                <span style={{ fontSize: 12, color: '#aaa' }}>Finding…</span>
                              ) : emailState === 'not_found' ? (
                                <span style={{ fontSize: 12, color: '#ddd' }}>Not found</span>
                              ) : typeof emailState === 'object' ? (
                                <a href={`mailto:${emailState.email}`} style={{ fontSize: 12, color: '#16a34a', textDecoration: 'none', fontWeight: 500 }}>{emailState.email}</a>
                              ) : (
                                <button onClick={() => findEmail(result)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 5, border: '1px solid #e5e5e5', background: '#fff', color: '#555', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  <Mail size={11} />Find Email
                                </button>
                              )}
                            </td>
                          )}
                          <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                            {person ? (
                              url ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#0a66c2', textDecoration: 'none' }}>View ↗</a> : '—'
                            ) : (
                              <button onClick={() => searchEmployees(result as CompanyResult)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 5, border: '1px solid #e5e5e5', background: '#fff', color: '#555', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <Users size={11} />Search Employees
                              </button>
                            )}
                          </td>
                          <td style={{ padding: '10px 16px 10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                            {inCrm ? (
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#6366f1', background: '#eef2ff', padding: '3px 8px', borderRadius: 5 }}>In CRM</span>
                            ) : isSaved ? (
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', background: '#f0fdf4', padding: '3px 8px', borderRadius: 5 }}>Saved ✓</span>
                            ) : isSaving ? (
                              <span style={{ fontSize: 11, color: '#aaa' }}>Saving…</span>
                            ) : (
                              <button onClick={() => saveOne(result)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: '1px solid #e5e5e5', background: '#fff', color: '#555', cursor: 'pointer' }}>Save</button>
                            )}
                          </td>
                        </tr>
                      </React.Fragment>
                    )
                  })}
                  {loading && (
                    <tr><td colSpan={showEmailCol ? 7 : 6} style={{ padding: '48px 20px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Fetching from Netrows…</td></tr>
                  )}
                  {!loading && results.length === 0 && (
                    <tr><td colSpan={showEmailCol ? 7 : 6} style={{ padding: '56px 20px', textAlign: 'center' }}>
                      <p style={{ margin: 0, fontSize: 13, color: '#ccc' }}>Set your criteria on the left and click <strong style={{ color: '#aaa' }}>Run Search</strong></p>
                    </td></tr>
                  )}
                </tbody>
              </table>
              {autoLoading && <div style={{ padding: '14px 20px', textAlign: 'center', fontSize: 12, color: '#aaa' }}>Loading {autoLoaded > 0 ? `${autoLoaded} / ${total}` : 'remaining results'}…</div>}
              {!autoLoading && results.length > 0 && results.length >= total && (
                <p style={{ textAlign: 'center', padding: '14px 20px', fontSize: 12, color: '#ccc', margin: 0 }}>
                  All {results.length} loaded · {peopleCount} people · {results.length - peopleCount} companies
                </p>
              )}
            </div>
          </>
        )}

        {/* ── URL Lookup mode ── */}
        {mode === 'lookup' && (
          <>
            {/* Person result card */}
            {lookupPersonResult && !lookupLoading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <div style={{ padding: 28, borderRadius: 14, border: '1px solid #e5e5e5', background: '#fff', width: 420, maxWidth: '88%', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
                    {lookupPersonResult.profile_picture ? (
                      <img src={lookupPersonResult.profile_picture} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22 }}>👤</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#111' }}>{lookupPersonResult.name ?? '—'}</p>
                      {lookupPersonResult.headline && <p style={{ margin: '3px 0 0', fontSize: 13, color: '#555', lineHeight: 1.4 }}>{lookupPersonResult.headline}</p>}
                      {lookupPersonResult.company && <p style={{ margin: '3px 0 0', fontSize: 12, color: '#999' }}>{lookupPersonResult.company}</p>}
                    </div>
                  </div>
                  {lookupPersonResult.found ? (
                    <div style={{ padding: '12px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                      <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 600, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Email Found</p>
                      <a href={`mailto:${lookupPersonResult.email}`} style={{ display: 'block', fontSize: 15, fontWeight: 600, color: '#16a34a', textDecoration: 'none' }}>{lookupPersonResult.email}</a>
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#6b7280' }}>✓ Saved to Outbound Leads</p>
                    </div>
                  ) : (
                    <div style={{ padding: '12px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                      <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>No email found — profile not saved to leads database</p>
                    </div>
                  )}
                  <button
                    onClick={() => { setLookupPersonResult(null); sessionStorage.removeItem('obs_lookup_person') }}
                    style={{ marginTop: 12, width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 500, borderRadius: 7, border: '1px solid #e5e5e5', background: '#fff', color: '#888', cursor: 'pointer' }}
                  >
                    Look up another →
                  </button>
                </div>
              </div>
            )}

            {/* Company employees table */}
            {lookupCompanyName && !lookupPersonResult && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', background: '#f5f3ff', borderBottom: '1px solid #e9d5ff', flexShrink: 0 }}>
                  <Building2 size={14} style={{ color: '#7c3aed' }} />
                  <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>{lookupCompanyName}</span>
                  <span style={{ fontSize: 12, color: '#a78bfa' }}>·</span>
                  <span style={{ fontSize: 12, color: '#a78bfa' }}>
                    {lookupEmployees.length}{lookupEmployeeTotal > lookupEmployees.length ? ` / ${lookupEmployeeTotal}` : ''} employees
                  </span>
                  <button onClick={() => { setLookupCompanyName(null); setLookupEmployees([]); setLookupEmployeeEmailMap({}) }} style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#7c3aed', background: '#fff', border: '1px solid #e9d5ff', borderRadius: 5, padding: '3px 10px', cursor: 'pointer' }}>
                    ← New Lookup
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
                    <thead>
                      <tr style={{ background: '#fff', borderBottom: '1px solid #e5e5e5', position: 'sticky', top: 0, zIndex: 1 }}>
                        <Th>Person</Th>
                        <Th w="30%">Headline</Th>
                        <Th w={120}>Location</Th>
                        <Th w={240}>Email</Th>
                        <Th w={80}>LinkedIn</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {lookupEmployees.map((person, i) => {
                        const url     = person.profileURL
                        const emailSt = lookupEmployeeEmailMap[url]
                        return (
                          <tr key={url ?? i} style={{ borderBottom: '1px solid #f0f0f0', background: '#fff' }}>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {person.profilePicture ? (
                                  <img src={person.profilePicture} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                ) : (
                                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>👤</div>
                                )}
                                <span style={{ fontWeight: 500, color: '#111', lineHeight: 1.3 }}>{person.fullName || '—'}</span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle', color: '#555', lineHeight: 1.4, maxWidth: 0 }}>
                              <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{person.headline || '—'}</span>
                            </td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontSize: 12, color: '#aaa', whiteSpace: 'nowrap' }}>{person.location || '—'}</td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                              {emailSt === 'fetching' ? (
                                <span style={{ fontSize: 12, color: '#aaa' }}>Finding…</span>
                              ) : emailSt === 'not_found' ? (
                                <span style={{ fontSize: 12, color: '#ddd' }}>Not found</span>
                              ) : emailSt && typeof emailSt === 'object' && emailSt.found ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <a href={`mailto:${emailSt.email}`} style={{ fontSize: 12, color: '#16a34a', textDecoration: 'none', fontWeight: 500 }}>{emailSt.email}</a>
                                  <span style={{ fontSize: 10, color: '#9ca3af', background: '#f0fdf4', padding: '1px 5px', borderRadius: 4 }}>saved ✓</span>
                                </div>
                              ) : (
                                <button
                                  onClick={() => generateEmailForEmployee(person)}
                                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '5px 11px', borderRadius: 6, border: '1px solid #111', background: '#111', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                >
                                  <Mail size={11} />Generate Email
                                </button>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                              {url ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#0a66c2', textDecoration: 'none' }}>View ↗</a> : '—'}
                            </td>
                          </tr>
                        )
                      })}
                      {lookupLoading && (
                        <tr><td colSpan={5} style={{ padding: '48px 20px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Fetching employees…</td></tr>
                      )}
                      {!lookupLoading && lookupEmployees.length === 0 && lookupCompanyName && (
                        <tr><td colSpan={5} style={{ padding: '48px 20px', textAlign: 'center', color: '#ccc', fontSize: 13 }}>No employees found for {lookupCompanyName}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Placeholder */}
            {!lookupPersonResult && !lookupCompanyName && !lookupLoading && (
              <Placeholder
                icon={<Globe size={44} strokeWidth={1} />}
                text={
                  detectedUrlType === 'company' ? 'Click "View Employees →" to see employees of this company'
                  : detectedUrlType === 'person' ? 'Click "Generate Email →" to find this person\'s email'
                  : 'Paste a LinkedIn /in/ or /company/ URL on the left'
                }
              />
            )}
            {lookupLoading && !lookupCompanyName && !lookupPersonResult && (
              <Placeholder icon={<Globe size={44} strokeWidth={1} />} text="Looking up…" />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Small helpers ──────────────────────────────────────────────────────────

function Th({ children, w, center }: { children?: React.ReactNode; w?: number | string; center?: boolean }) {
  return (
    <th style={{ padding: '10px 12px', textAlign: center ? 'center' : 'left', fontWeight: 600, color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', width: w, whiteSpace: 'nowrap' }}>
      {children}
    </th>
  )
}

function Placeholder({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12 }}>
      <div style={{ color: '#ddd' }}>{icon}</div>
      <p style={{ margin: 0, fontSize: 14, color: '#bbb', textAlign: 'center', maxWidth: 320 }}>{text}</p>
    </div>
  )
}
