'use client'

/**
 * Ask about this client (src/lib/admin/k/ask.ts): a question answered from this business's own
 * records, with the records it rests on. An answer that cites nothing or states a figure that is
 * not on file is refused, and says why.
 */
import { useState } from 'react'
import { Btn } from '@/components/crm/primitives'
import { Input } from '@/components/ui/input'
import type { Answer } from '@/lib/admin/k/ask'
import { askClient } from '@/app/companies/[id]/actions'

export function AskClient({ companyId }: { companyId: string }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<(Answer & { question: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function ask() {
    const question = q.trim()
    if (question.length < 3) return
    setBusy(true); setError(null)
    try {
      const r = await askClient(companyId, question)
      if (!r.ok) { setError(r.error); return }
      setOut({ ...(r.data as Answer), question })
    } catch (e) { setError(e instanceof Error ? e.message : 'No answer.') } finally { setBusy(false) }
  }

  return (
    <section className="mb-4 min-w-0" aria-label="Ask about this client">
      <h2 className="m-0 mb-2 text-small text-trs-muted">Ask about this client</h2>
      <form className="flex gap-2 max-w-[760px]" onSubmit={e => { e.preventDefault(); void ask() }}>
        <Input value={q} onChange={e => setQ(e.target.value)} maxLength={500} aria-label="Question about this client" placeholder="What did they pay for WICA last year, and what was claimed?"
          className="flex-1 min-w-0" />
        <Btn type="submit" level="secondary" loading={busy} disabled={busy || q.trim().length < 3}>Ask</Btn>
      </form>
      {error && <p className="m-0 mt-2 text-body text-trs-neg" role="alert">{error}</p>}
      {out && (
        <div className="mt-3 max-w-[760px] text-body" role="status">
          <div className="text-small text-trs-muted">{out.question}</div>
          {out.refused ? <p className="m-0 mt-1 text-trs-muted">{out.refused}</p> : <p className="m-0 mt-1 whitespace-pre-wrap text-trs-ink">{out.answer}</p>}
          {out.sources.length > 0 && (
            <ul className="m-0 mt-2 p-0 list-none flex flex-wrap gap-x-3 gap-y-1 text-small">
              {out.sources.map(s => <li key={s.id}>{s.href ? <a href={s.href} className="text-trs-ink underline">{s.label}</a> : <span className="text-trs-muted">{s.label}</span>}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
