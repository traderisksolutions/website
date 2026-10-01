'use client'

/**
 * Ask AI.
 *
 * One question, one answer, and the sources under it. The sources are the point: the model
 * decides for itself whether to search, so an answer with none is shown as exactly that rather
 * than presented like a researched one.
 */

import { useCallback, useEffect, useState } from 'react'
import { Search, RefreshCw, ExternalLink, Paperclip } from 'lucide-react'
import { Btn, SectionCard, Spinner, textareaCls } from '@/components/crm/primitives'

const INK = '#202124'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const RULE = '#e8eaed'

type Source = { n: number; title: string; uri: string }
type Passage = {
  n: number; source: 'message' | 'attachment'; fileName: string | null
  threadId: string | null; attachmentId: string | null; sentAt: string | null
  similarity: number; excerpt: string
}
type Answer = {
  answer: string; sources: Source[]; queries: string[]; grounded: boolean
  warning: string | null; model: string; archive: Passage[]; error?: string
}
type Company = { id: string; name: string }

/**
 * The answer comes back as light Markdown. Rendering it with a parser would mean a new
 * dependency for four constructs, so the four are handled here: ## heading, * list item,
 * **bold**, and a blank line between paragraphs. Anything else is shown as written.
 */
function Rendered({ text }: { text: string }) {
  const bold = (s: string) => {
    const out: React.ReactNode[] = []
    const re = /\*\*(.+?)\*\*/g
    let last = 0, m: RegExpExecArray | null
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index))
      out.push(<strong key={`${m.index}`} className="font-medium" style={{ color: INK }}>{m[1]}</strong>)
      last = m.index + m[0].length
    }
    if (last < s.length) out.push(s.slice(last))
    return out
  }

  const blocks: React.ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (!list.length) return
    blocks.push(
      <ul key={`l${blocks.length}`} className="my-2.5 space-y-1.5 pl-4">
        {list.map((li, i) => (
          <li key={i} className="text-[14px] leading-[1.65] list-disc" style={{ color: MUTED }}>{bold(li)}</li>
        ))}
      </ul>,
    )
    list = []
  }

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (/^\s*[*-]\s+/.test(line)) { list.push(line.replace(/^\s*[*-]\s+/, '')); continue }
    flush()
    if (!line.trim()) continue
    if (/^#{2,4}\s+/.test(line)) {
      blocks.push(
        <h3 key={blocks.length} className="mt-5 mb-1.5 text-[13px] font-medium uppercase tracking-[0.04em]" style={{ color: FAINT }}>
          {line.replace(/^#{2,4}\s+/, '')}
        </h3>,
      )
    } else {
      blocks.push(
        <p key={blocks.length} className="my-2.5 text-[14px] leading-[1.65]" style={{ color: MUTED }}>{bold(line)}</p>,
      )
    }
  }
  flush()
  return <div>{blocks}</div>
}

const EXAMPLES = [
  'What does an Average Clause do in a Singapore commercial property policy?',
  'Is a Work Injury Compensation policy required for a foreign worker on a short-term pass?',
  'What limit of Professional Indemnity does MAS require of an insurance broker?',
]

export default function AskPage() {
  const [q, setQ] = useState('')
  const [companyId, setCompanyId] = useState<string>('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [a, setA] = useState<Answer | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/companies/triage', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { companies: [] })
      .then(j => setCompanies((j.companies ?? []).map((c: Company) => ({ id: c.id, name: c.name }))))
      .catch(() => {})
  }, [])

  const run = useCallback(async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    setBusy(true); setErr(null); setA(null)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, companyId: companyId || null }),
      })
      const j = await res.json() as Answer
      if (!res.ok || j.error) setErr(j.error ?? `Request failed (${res.status})`)
      else setA(j)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally { setBusy(false) }
  }, [busy, companyId])

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-[840px] px-4 sm:px-6 py-8 sm:py-10">

        <header className="pb-5" style={{ borderBottom: `1px solid ${RULE}` }}>
          <h1 className="text-[22px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Ask AI</h1>
          <p className="mt-1.5 text-[14px]" style={{ color: MUTED }}>
            Answers from the web, with sources. Name a client to search their file too.
          </p>
        </header>

        <div className="pt-5">
          <textarea
            id="ask-question"
            className={textareaCls}
            rows={3}
            placeholder="What does this clause mean?"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run(q) }}
          />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <select
              id="ask-company"
              value={companyId}
              onChange={e => setCompanyId(e.target.value)}
              className="h-10 w-full sm:w-auto sm:max-w-[260px] min-w-0 truncate rounded-[10px] border px-3 text-[13px] bg-white"
              style={{ borderColor: '#dadce0', color: companyId ? INK : FAINT }}
            >
              <option value="">No client named</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Btn level="primary" onClick={() => run(q)} loading={busy} disabled={!q.trim()}>
              <Search size={14} className="mr-1.5" /> Ask
            </Btn>
            <span className="text-[12px]" style={{ color: FAINT }}>⌘↵</span>
          </div>

          {!a && !busy && (
            <div className="mt-4 flex flex-wrap gap-2">
              {EXAMPLES.map(x => (
                <button key={x} onClick={() => { setQ(x); run(x) }}
                  className="rounded-full border px-3 py-1.5 text-[12px] text-left transition-colors hover:border-[#202124]"
                  style={{ borderColor: '#dadce0', color: MUTED }}>
                  {x}
                </button>
              ))}
            </div>
          )}
        </div>

        {busy && <div className="py-14"><Spinner label="Searching and reading" /></div>}

        {err && (
          <div className="mt-5 rounded-[10px] px-3.5 py-3 text-[13px]" style={{ border: '1px solid #dadce0', color: INK }}>
            {err}
          </div>
        )}

        {a && (
          <div className="mt-6 space-y-5">
            {a.warning && (
              <div className="rounded-[10px] px-3.5 py-3 text-[13px] leading-relaxed"
                   style={{ border: `1px solid ${INK}`, color: INK }}>
                {a.warning}
              </div>
            )}

            <SectionCard
              title="Answer"
              actions={<span className="text-[12px] tabular-nums" style={{ color: FAINT }}>
                {a.model}{a.grounded ? ` · ${a.sources.length} sources` : ' · no sources'}
              </span>}
            >
              <Rendered text={a.answer} />
            </SectionCard>

            {a.queries.length > 0 && (
              <SectionCard title="Searches run">
                <ul className="space-y-1.5">
                  {a.queries.map((x, i) => (
                    <li key={i} className="text-[13px]" style={{ color: MUTED }}>{x}</li>
                  ))}
                </ul>
              </SectionCard>
            )}

            {a.sources.length > 0 && (
              <SectionCard title="Sources">
                <ol className="space-y-2">
                  {a.sources.map(s => (
                    <li key={s.n} className="flex gap-2.5 text-[13px]">
                      <span className="tabular-nums shrink-0" style={{ color: FAINT }}>[{s.n}]</span>
                      <a href={s.uri} target="_blank" rel="noreferrer"
                         className="inline-flex items-center gap-1.5 underline decoration-[#dadce0] hover:decoration-[#202124]"
                         style={{ color: INK }}>
                        {s.title || s.uri}
                        <ExternalLink size={12} style={{ color: FAINT }} />
                      </a>
                    </li>
                  ))}
                </ol>
              </SectionCard>
            )}

            {a.archive.length > 0 && (
              <SectionCard
                title="From this client's file"
                actions={<span className="text-[12px] tabular-nums" style={{ color: FAINT }}>{a.archive.length} passages</span>}
              >
                <ul className="space-y-3">
                  {a.archive.map(p => (
                    <li key={p.n} className="pb-3" style={{ borderBottom: `1px solid ${RULE}` }}>
                      <div className="flex items-center gap-2 text-[12px]" style={{ color: FAINT }}>
                        <span className="tabular-nums">A{p.n}</span>
                        {p.source === 'attachment'
                          ? <span className="inline-flex items-center gap-1"><Paperclip size={11} />{p.fileName ?? 'file'}</span>
                          : <span>earlier email</span>}
                        {p.sentAt && <span className="tabular-nums">{p.sentAt.slice(0, 10)}</span>}
                        <span className="tabular-nums">{(p.similarity * 100).toFixed(0)}% match</span>
                      </div>
                      <p className="mt-1.5 text-[13px] leading-[1.6]" style={{ color: MUTED }}>{p.excerpt}</p>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}

            <div className="flex justify-end">
              <Btn level="tertiary" onClick={() => run(q)}>
                <RefreshCw size={14} className="mr-1.5" /> Ask again
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
