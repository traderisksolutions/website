'use client'

import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { openEngagementCompose } from '@/lib/engagement-handoff'

export type SendableAttachment = {
  filename: string; storage_url: string
  source: 'client_invoice' | 'commission_statement' | 'trs_debit_note' | 'generated' | 'other'
}

export const ATTACHMENT_SOURCE_LABEL: Record<SendableAttachment['source'], string> = {
  client_invoice: 'Client invoice', commission_statement: 'Commission statement (internal)',
  trs_debit_note: 'TRS debit note', generated: 'TRS debit note', other: 'Document',
}

export type SendDocumentsTarget = {
  debitNoteId: string; debitNoteNo: string; companyName: string | null
  contactEmail: string | null; contactName: string | null
  attachmentFiles: SendableAttachment[]
}

/**
 * The explicit, nothing-pre-selected file picker for emailing a debit note's documents — used
 * both from the Debit Notes list drawer and right after generating a brand-new debit note.
 * Deliberately never defaults any checkbox on, since attachment_files can include the
 * commission statement (internal-only — reveals TRS's margin) alongside client-safe documents.
 */
export function SendDocumentsModal({ target, onClose }: { target: SendDocumentsTarget; onClose: () => void }) {
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(url: string) {
    setChecked(prev => { const next = new Set(prev); next.has(url) ? next.delete(url) : next.add(url); return next })
  }

  async function send() {
    if (checked.size === 0) { setError('Select at least one document to send.'); return }
    setSending(true); setError(null)
    try {
      const res = await fetch(`/api/debit-notes/${target.debitNoteId}/zip-attachment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storageUrls: Array.from(checked) }),
      })
      const att = await res.json()
      if (!res.ok) throw new Error(att.error ?? 'Could not prepare attachment')
      openEngagementCompose({
        toEmail: target.contactEmail ?? '',
        toName: target.contactName || undefined,
        subject: `Debit Note ${target.debitNoteNo} — ${target.companyName ?? ''}`,
        body: `Dear ${target.contactName || 'Sir/Madam'},\n\nPlease find attached the document(s) for Debit Note ${target.debitNoteNo}.\n\nThank you.`,
        attachment: att,
      })
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send'); setSending(false) }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader><DialogTitle>Send documents</DialogTitle></DialogHeader>
        <p className="text-[11.5px] text-muted-foreground -mt-2 mb-1">Nothing is pre-selected — choose exactly what {target.contactEmail} should receive.</p>
        <div className="flex flex-col gap-1.5">
          {target.attachmentFiles.map(f => (
            <label key={f.storage_url} className="flex items-center gap-2.5 rounded-md border border-[--border-subtle] px-2.5 py-2 cursor-pointer hover:bg-accent/40">
              <input type="checkbox" checked={checked.has(f.storage_url)} onChange={() => toggle(f.storage_url)} className="accent-primary" />
              <div className="flex flex-col min-w-0">
                <span className="text-[12.5px] truncate">{f.filename}</span>
                <span className="text-[10.5px] text-muted-foreground">{ATTACHMENT_SOURCE_LABEL[f.source]}</span>
              </div>
            </label>
          ))}
        </div>
        {error && <p className="text-[11.5px] text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={send} disabled={sending || checked.size === 0}>
            {sending ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Send size={13} className="mr-1.5" />} Send
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
