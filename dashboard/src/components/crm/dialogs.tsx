'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Btn, Field, inputCls, textareaCls } from './primitives'
import { STAGES, STAGE_LABEL, STAGE_HELP, type Stage, type Company } from '@/lib/crm/types'

/** Create a client company by hand. Everything except the name is optional. */
export function NewCompanyDialog({ open, onClose, onCreated, defaultName, defaultDomain, defaultStage = 'client' }: {
  open: boolean; onClose: () => void; onCreated?: (id: string) => void
  defaultName?: string; defaultDomain?: string; defaultStage?: Stage
}) {
  const router = useRouter()
  const [name, setName] = useState(defaultName ?? '')
  const [domain, setDomain] = useState(defaultDomain ?? '')
  const [stage, setStage] = useState<Stage>(defaultStage)
  const [industry, setIndustry] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (open) { setName(defaultName ?? ''); setDomain(defaultDomain ?? ''); setStage(defaultStage); setIndustry(''); setError(null) } }, [open, defaultName, defaultDomain, defaultStage])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), domain: domain.trim() || null, stage, industry: industry.trim() || null }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not create the company.')
      onClose()
      if (onCreated) onCreated(d.id); else router.push(`/companies/${d.id}`)
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New company</DialogTitle>
          <DialogDescription>Add a client company. Emails from its domain will link to it automatically.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Company name"><input autoFocus className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Zoomoov Pte Ltd" required /></Field>
          <Field label="Email domain" hint="Optional. Used to file incoming emails under this company."><input className={inputCls} value={domain} onChange={e => setDomain(e.target.value)} placeholder="e.g. zoomoov.com" /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Stage">
              <select className={inputCls} value={stage} onChange={e => setStage(e.target.value as Stage)}>
                {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </select>
            </Field>
            <Field label="Industry"><input className={inputCls} value={industry} onChange={e => setIndustry(e.target.value)} placeholder="Optional" /></Field>
          </div>
          <p className="text-[11px] text-muted-foreground m-0">{STAGE_HELP[stage]}</p>
          {error && <p className="text-[12px] text-destructive m-0">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Btn type="button" level="tertiary" onClick={onClose}>Cancel</Btn>
            <Btn type="submit" level="primary" loading={saving}>Create company</Btn>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Edit the company's own fields. Domains are comma separated. */
export function EditCompanyDialog({ open, onClose, company, onSaved }: { open: boolean; onClose: () => void; company: Company; onSaved: (c: Company) => void }) {
  const [name, setName] = useState(company.name)
  const [domains, setDomains] = useState(company.domains.join(', '))
  const [owner, setOwner] = useState(company.owner_email ?? '')
  const [industry, setIndustry] = useState(company.industry ?? '')
  const [address, setAddress] = useState(company.address ?? '')
  const [notes, setNotes] = useState(company.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(company.name); setDomains(company.domains.join(', ')); setOwner(company.owner_email ?? '')
    setIndustry(company.industry ?? ''); setAddress(company.address ?? ''); setNotes(company.notes ?? ''); setError(null)
  }, [open, company])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, domains: domains.split(/[,\s]+/).map(s => s.trim()).filter(Boolean), owner_email: owner.trim() || null, industry, address, notes }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not save.')
      onSaved(d.company)
      onClose()
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Edit company</DialogTitle>
          <DialogDescription>Details used across the dashboard and by the company agent.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Company name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} required /></Field>
          <Field label="Email domains" hint="Comma separated. Emails from these domains are filed here automatically."><input className={inputCls} value={domains} onChange={e => setDomains(e.target.value)} placeholder="zoomoov.com, zoomoov.sg" /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="TRS account owner"><input className={inputCls} value={owner} onChange={e => setOwner(e.target.value)} placeholder="name@trade-risksol.com" /></Field>
            <Field label="Industry"><input className={inputCls} value={industry} onChange={e => setIndustry(e.target.value)} /></Field>
          </div>
          <Field label="Address"><input className={inputCls} value={address} onChange={e => setAddress(e.target.value)} /></Field>
          <Field label="Account notes" hint="Shown to the agent when it drafts replies and briefs."><textarea className={textareaCls} rows={4} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
          {error && <p className="text-[12px] text-destructive m-0">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Btn type="button" level="tertiary" onClick={onClose}>Cancel</Btn>
            <Btn type="submit" level="primary" loading={saving}>Save</Btn>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
