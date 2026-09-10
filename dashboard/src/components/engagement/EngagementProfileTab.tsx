'use client'

import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck, MessageSquareText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CustomerProfile } from '@/lib/customer-profile'

/** The full "Customer" dock tab — company facts, active policies, the cross-thread interaction
 *  history, and two staff-editable notes fields (contact + company) that the AI draft route
 *  also reads. Deliberately separate from EngagementContextPanel's existing "Internal notes"
 *  field (that one saves to inbound_leads.notes — a different record entirely; this tab's notes
 *  save to contacts.notes / companies.notes, which is what the customer profile actually reads). */
export function EngagementProfileTab({ contactId }: { contactId: string | null }) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!contactId) { setProfile(null); return }
    let cancelled = false
    setLoading(true)
    fetch(`/api/customer-profile?contactId=${contactId}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setProfile(d) })
      .catch(() => { if (!cancelled) setProfile(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [contactId])

  if (!contactId) {
    return <div className="p-5 text-[12px] text-muted-foreground/60">Open an email thread to see the customer profile.</div>
  }
  if (loading && !profile) {
    return <div className="p-5 flex items-center gap-2 text-[12px] text-muted-foreground"><Loader2 size={13} className="animate-spin" /> Loading customer profile…</div>
  }
  if (!profile) {
    return <div className="p-5 text-[12px] text-muted-foreground/60">Couldn&apos;t load a customer profile for this contact.</div>
  }

  const activePolicies = profile.policies.filter(p => p.status === 'active')

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Company + policies */}
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider m-0">
          {profile.company ? profile.company.name : 'No linked company'}
        </p>
        {profile.company && (
          <p className="text-[11.5px] text-muted-foreground/70 m-0">
            {[profile.company.industry, profile.company.type, profile.customerStatus === 'renewal_due' ? 'Renewal due' : null]
              .filter(Boolean).join(' · ') || '—'}
          </p>
        )}
        {activePolicies.length > 0 ? (
          <div className="flex flex-col gap-1 mt-1">
            {activePolicies.map(p => (
              <div key={p.id} className="flex items-center gap-1.5 text-[11.5px] text-foreground/80">
                <ShieldCheck size={12} className="text-[--success] flex-shrink-0" />
                {p.class_of_insurance || p.insurer || 'Policy'}
                {p.end_date && <span className="text-muted-foreground/50">· expires {new Date(p.end_date).toLocaleDateString('en-SG')}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11.5px] text-muted-foreground/50 m-0">No active policies on file.</p>
        )}
      </div>

      {/* Interaction history */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider m-0">Prior interactions</p>
        {profile.recentSummaries.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground/50 m-0">No summarized history yet — appears here once threads have been analyzed.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {[...profile.recentSummaries].reverse().map(s => (
              <a
                key={s.thread_id}
                href={`/engagement?thread=${s.thread_id}`}
                className="flex items-start gap-1.5 text-[11.5px] text-foreground/75 no-underline hover:text-foreground rounded-lg px-2 py-1.5 -mx-2 hover:bg-muted/50 transition-colors"
              >
                <MessageSquareText size={12} className="mt-0.5 flex-shrink-0 text-muted-foreground/50" />
                <span>
                  <span className="text-muted-foreground/60">[{new Date(s.created_at).toLocaleDateString('en-SG')}] </span>
                  <span className="font-medium">{s.subject ?? 'Untitled'}</span>
                  {' — '}{s.summary}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Notes — contact + company, both feed into draft generation */}
      <NotesField label="Contact notes" value={profile.contact.notes} url={`/api/contacts/${profile.contact.id}`} />
      {profile.company && (
        <NotesField label="Account notes" value={profile.company.notes} url={`/api/companies/${profile.company.id}`} />
      )}
    </div>
  )
}

function NotesField({ label, value, url }: { label: string; value: string | null; url: string }) {
  const [text, setText]     = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  useEffect(() => { setText(value ?? ''); setSaved(false) }, [url, value])

  const dirty = text !== (value ?? '')

  async function save() {
    if (!dirty) return
    setSaving(true)
    try {
      await fetch(url, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: text }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider m-0">{label}</p>
        <span className={cn(
          'text-[10px] transition-colors',
          saved ? 'text-[--success]' : saving ? 'text-muted-foreground/60' : dirty ? 'text-[--warning]' : 'text-transparent',
        )}>
          {saved ? 'Saved' : saving ? 'Saving…' : dirty ? 'Unsaved' : '·'}
        </span>
      </div>
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setSaved(false) }}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save() } }}
        aria-label={label}
        placeholder="Auto-saves on blur — the AI reads this when drafting replies."
        rows={3}
        className="w-full text-[11.5px] text-foreground/70 leading-[1.65] resize-y border border-[--border-subtle] rounded-lg px-3 py-2 bg-background outline-none focus:ring-1 focus:ring-primary/25 focus:border-primary/30 placeholder:text-muted-foreground/35 transition-colors"
      />
    </div>
  )
}
