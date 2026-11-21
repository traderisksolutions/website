'use client'

/**
 * AI Agents (Jarod's approved design, 20 Nov 2026; monitoring only): the agents with their key,
 * status, runs and spend; one agent's workflow and figures; usage by agent and by model. Every
 * figure is from the usage log (gemini_usage_log), last 30 days against the 30 before.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { PageFrame } from '@/components/page-frame'
import { Breadcrumbs } from '@/components/nav/Breadcrumbs'
import { Chip, Segmented } from '@/components/crm/primitives'
import { Register, RegisterCell, RegisterHead, RegisterRow, RegisterTh } from '@/components/ui/register'
import { fmtDateTime } from '@/lib/format'
import { NODE_KIND, type NodeKind } from '@/lib/agents/flows'
import type { AgentDetail, AgentSummary, KnowledgeRow, Place, Tally } from '@/lib/agents/place'
import { DRAFTS, type DocVersion } from '@/lib/agents/knowledge'
import { DocEditor } from './DocEditor'
import Link from 'next/link'

const sgd = (n: number) => n.toFixed(2)
/** gb_last_year_read → "EB last year read": the logged feature, readable. */
const fnName = (f: string) => { const w = f.replace(/^gb_/, 'EB_').replace(/_/g, ' '); return w.charAt(0).toUpperCase() + w.slice(1) }
const tokens = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}m` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
const errRate = (t: Tally) => t.calls ? `${Math.round((100 * t.failed) / t.calls)}%` : '–'
const KEY_CHIP = { own: <Chip tone="green">Own key</Chip>, shared: <Chip tone="amber">Shared</Chip>, missing: <Chip tone="red">Missing</Chip> }
const sourceChips = (xs: string[]) => <span className="inline-flex flex-wrap justify-center gap-1">{xs.map(x => <Chip key={x} tone="blue">{x}</Chip>)}</span>

export function AgentsList({ place }: { place: Place }) {
  const router = useRouter()
  return (
    <PageFrame>
      <PageHeader title="AI Agents" meta={`${place.agents.length} agents · last 30 days · ${place.mode === 'manual' ? 'every model call started by a person' : 'automatic runs on'}`} />
      <Register label="AI Agents" minWidth={1040}>
        <RegisterHead>
          <RegisterTh first width={300}>Agent</RegisterTh><RegisterTh>Source</RegisterTh><RegisterTh>Model</RegisterTh><RegisterTh>Key</RegisterTh>
          <RegisterTh>Status</RegisterTh><RegisterTh>Runs</RegisterTh><RegisterTh>Failed</RegisterTh><RegisterTh last>S$</RegisterTh>
        </RegisterHead>
        <tbody>
          {place.agents.map(a => (
            <RegisterRow key={a.id} onClick={() => router.push(`/agents/${a.id}`)} className="cursor-pointer">
              <RegisterCell first primary={a.name} secondary={a.work} align="left" nowrap={false} />
              <RegisterCell nowrap={false}>{sourceChips(a.sources)}</RegisterCell>
              <RegisterCell>{a.model}</RegisterCell>
              <RegisterCell>{KEY_CHIP[a.key]}</RegisterCell>
              <RegisterCell>{a.status === 'Active' ? <Chip tone="green">Active</Chip> : <Chip>Off</Chip>}</RegisterCell>
              <RegisterCell>{a.last30.calls}</RegisterCell>
              <RegisterCell>{a.last30.failed ? <span className="font-medium text-trs-neg">{a.last30.failed}</span> : 0}</RegisterCell>
              <RegisterCell last>{sgd(a.last30.sgd)}</RegisterCell>
            </RegisterRow>
          ))}
        </tbody>
      </Register>
    </PageFrame>
  )
}

const KIND_CLASS: Record<NodeKind, string> = {
  trigger: 'bg-trs-info', model: 'bg-trs-green', code: 'bg-trs-ink-2', decide: 'bg-trs-warn', person: 'bg-trs-neg', write: 'bg-trs-muted',
}
const KIND_MARK: Record<NodeKind, string> = { trigger: '▶', model: '✦', code: '{ }', decide: '?', person: '●', write: '↓' }

function Canvas({ a, sel, onSel }: { a: AgentDetail; sel: number; onSel: (i: number) => void }) {
  const W = 204, H = 108, PX = 20, PY = 26, MID = 42
  const cols = Math.max(...a.flow.nodes.map(n => n.col)) + 1
  const pos = a.flow.nodes.map(n => ({ x: PX + n.col * W, y: PY + n.row * H }))
  const sw = PX * 2 + cols * W - 32, sh = PY * 2 + 3 * H - 30
  return (
    <div className="overflow-auto rounded-xl bg-trs-canvas" role="img" aria-label={`${a.name} workflow`}>
      <div className="relative" style={{ width: sw, height: sh }} /* drift-ok: canvas size from the flow */>
        <svg className="pointer-events-none absolute inset-0 overflow-visible text-trs-subtle" width={sw} height={sh} viewBox={`0 0 ${sw} ${sh}`} aria-hidden>
          {a.flow.edges.map(([f, t, l], i) => {
            const s = pos[f], e = pos[t], x1 = s.x + 150, y1 = s.y + MID, x2 = e.x, y2 = e.y + MID, dx = Math.max(24, (x2 - x1) / 2)
            return (
              <g key={i}>
                <path d={`M${x1} ${y1} C${x1 + dx} ${y1},${x2 - dx} ${y2},${x2} ${y2}`} fill="none" stroke="currentColor" strokeWidth={1.6} />
                {l && <text x={(x1 + x2) / 2} y={Math.min(y1, y2) - 6} textAnchor="middle" fontSize={11} className="fill-trs-muted">{l}</text>}
              </g>
            )
          })}
        </svg>
        {a.flow.nodes.map((n, i) => (
          <button key={i} type="button" onClick={() => onSel(i)} aria-pressed={sel === i} /* drift-ok: a canvas node is a positioned card, not a form control */
            className={`absolute w-[150px] rounded-xl border-[1.5px] bg-white px-3 py-2.5 text-left ${sel === i ? 'border-trs-green ring-[3px] ring-trs-mint' : 'border-trs-line hover:border-trs-subtle'} ${a.status === 'Off' ? 'opacity-50' : ''}`}
            style={{ left: pos[i].x, top: pos[i].y }} /* drift-ok: node position from the flow */>
            <span className="flex items-center gap-1.5 text-small font-semibold uppercase tracking-[0.06em] text-trs-muted">
              <span aria-hidden className={`inline-grid size-5 place-items-center rounded text-small text-white ${KIND_CLASS[n.kind]}`}>{KIND_MARK[n.kind]}</span>{NODE_KIND[n.kind]}
            </span>
            <span className="mt-0.5 block text-small font-semibold leading-tight text-trs-ink">{n.title}</span>
            {n.detail && <span className="mt-1 block text-small text-trs-ink-2">{n.detail}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

function RunsChart({ a }: { a: AgentDetail }) {
  const W = 560, H = 120, bw = 26, gap = (W - 14 * bw) / 13
  const max = Math.max(1, ...a.days.map(d => d.ok + d.failed)), k = (H - 20) / max
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="h-auto w-full max-w-[560px]" role="img" aria-label="Runs a day, last 14 days: answered and failed">
        {a.days.map((d, i) => {
          const x = i * (bw + gap), okH = d.ok * k, fH = d.failed * k
          return (
            <g key={d.day}>
              {d.ok > 0 && <rect x={x} y={H - okH} width={bw} height={Math.max(okH - 2, 1)} rx={3} className="fill-trs-green"><title>{`${d.day}: ${d.ok} answered`}</title></rect>}
              {d.failed > 0 && <rect x={x} y={H - okH - fH} width={bw} height={Math.max(fH - 2, 1)} rx={3} className="fill-trs-neg"><title>{`${d.day}: ${d.failed} failed`}</title></rect>}
              {i % 2 === 0 && <text x={x + bw / 2} y={H + 14} textAnchor="middle" fontSize={10} className="fill-trs-muted">{d.day.slice(8)}</text>}
            </g>
          )
        })}
        <line x1={0} x2={W} y1={H} y2={H} className="stroke-trs-line" />
      </svg>
      <figcaption className="mt-2 flex gap-4 text-small text-trs-ink-2">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-trs-green" />Answered</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-trs-neg" />Failed</span>
      </figcaption>
    </figure>
  )
}

function Functions({ a, cost }: { a: AgentDetail; cost: boolean }) {
  return (
    <Register label="Functions" minWidth={760}>
      <RegisterHead>
        <RegisterTh first width={260}>Function</RegisterTh><RegisterTh>Model</RegisterTh><RegisterTh>Runs</RegisterTh><RegisterTh last={!cost}>Failed</RegisterTh>
        {cost && <><RegisterTh>Tokens</RegisterTh><RegisterTh last>S$</RegisterTh></>}
      </RegisterHead>
      <tbody>
        {a.functions.length === 0 ? <RegisterRow><RegisterCell first colSpan={cost ? 6 : 4} align="left">No runs in 30 days</RegisterCell></RegisterRow>
          : a.functions.map(f => (
            <RegisterRow key={`${f.feature}|${f.model}`}>
              <RegisterCell first primary={fnName(f.feature)} align="left" />
              <RegisterCell>{f.model}</RegisterCell>
              <RegisterCell>{f.calls}</RegisterCell>
              <RegisterCell last={!cost}>{f.failed}</RegisterCell>
              {cost && <><RegisterCell>{tokens(f.tokens)}</RegisterCell><RegisterCell last>{sgd(f.sgd)}</RegisterCell></>}
            </RegisterRow>
          ))}
      </tbody>
    </Register>
  )
}

export function AgentPage({ a, docs }: { a: AgentDetail; docs: { instructions: DocVersion[]; knowledge: KnowledgeRow[] } }) {
  const [tab, setTab] = useState<'overview' | 'instructions' | 'knowledge' | 'usage'>('overview')
  const [sel, setSel] = useState(0)
  const node = a.flow.nodes[sel]
  const measures: [string, string, string][] = [
    ['Runs', String(a.last30.calls), String(a.previous.calls)], ['Failed', String(a.last30.failed), String(a.previous.failed)],
    ['Error rate', errRate(a.last30), errRate(a.previous)], ['Tokens', tokens(a.last30.tokens), tokens(a.previous.tokens)], ['S$', sgd(a.last30.sgd), sgd(a.previous.sgd)],
  ]
  return (
    <PageFrame>
      <Breadcrumbs current={{ label: a.name, href: `/agents/${a.id}` }} fallback={{ label: 'AI Agents', href: '/agents' }} />
      <PageHeader title={a.name} meta={`${a.model} · ${a.keyName} · last run ${a.lastRun ? fmtDateTime(a.lastRun) : 'none in 30 days'}`}
        actions={<span className="inline-flex gap-2">{KEY_CHIP[a.key]}{a.status === 'Active' ? <Chip tone="green">Active</Chip> : <Chip>Off</Chip>}</span>} />
      <Segmented variant="tabs" size="sm" label="Agent" value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'instructions', label: 'Instructions' }, { value: 'knowledge', label: 'Knowledge' }, { value: 'usage', label: 'Usage' }]} />
      {tab === 'overview' ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <Canvas a={a} sel={sel} onSel={setSel} />
            <div className="self-start rounded-xl border-[1.5px] border-trs-line p-4">
              <div className="text-small text-trs-muted">{NODE_KIND[node.kind]}</div>
              <h3 className="m-0 mt-0.5 text-body font-semibold">{node.title}</h3>
              <dl className="m-0 mt-3 grid grid-cols-[96px_1fr] gap-x-2.5 gap-y-1.5 text-small">
                <dt className="text-trs-muted">Detail</dt><dd className="m-0">{node.detail || '–'}</dd>
                {node.kind === 'model' && <><dt className="text-trs-muted">Model</dt><dd className="m-0">{a.model}</dd><dt className="text-trs-muted">Key</dt><dd className="m-0">{KEY_CHIP[a.key]}</dd></>}
                <dt className="text-trs-muted">Step</dt><dd className="m-0">{`${sel + 1} of ${a.flow.nodes.length}`}</dd>
              </dl>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <section className="flex flex-col gap-2" aria-label="Runs a day"><h2 className="m-0 text-heading font-medium">Runs a day</h2><RunsChart a={a} /></section>
            <Register label="Last 30 days" minWidth={320}>
              <RegisterHead><RegisterTh first>Last 30 days</RegisterTh><RegisterTh>Now</RegisterTh><RegisterTh last>Before</RegisterTh></RegisterHead>
              <tbody>{measures.map(m => <RegisterRow key={m[0]}><RegisterCell first primary={m[0]} align="left" /><RegisterCell>{m[1]}</RegisterCell><RegisterCell last><span className="text-trs-muted">{m[2]}</span></RegisterCell></RegisterRow>)}</tbody>
            </Register>
          </div>
          <Functions a={a} cost={false} />
        </>
      ) : tab === 'instructions' ? (
        <>
          <DocEditor docKey={`agent:${a.id}`} title="Instructions and guardrails" versions={docs.instructions} draft={DRAFTS[`agent:${a.id}`] ?? ''} />
          <p className="m-0 text-small text-trs-muted">{`Every agent also reads Tone of voice${docs.knowledge.find(k => k.key === 'tone')?.version ? ` (version ${docs.knowledge.find(k => k.key === 'tone')!.version})` : ' once saved'}. `}<Link href="/agents/knowledge/tone" className="text-trs-ink underline underline-offset-4">Edit</Link></p>
        </>
      ) : tab === 'knowledge' ? <KnowledgeTable rows={docs.knowledge} /> : <Functions a={a} cost />}
    </PageFrame>
  )
}

export function AgentsUsage({ place }: { place: Place }) {
  const router = useRouter()
  const total = place.agents.reduce((s, a) => s + a.last30.sgd, 0) + place.unattributed.sgd
  const calls = place.agents.reduce((s, a) => s + a.last30.calls, 0) + place.unattributed.calls
  const row = (a: AgentSummary) => (
    <RegisterRow key={a.id} onClick={() => router.push(`/agents/${a.id}`)} className="cursor-pointer">
      <RegisterCell first primary={a.name} align="left" />
      <RegisterCell>{KEY_CHIP[a.key]}</RegisterCell>
      <RegisterCell>{a.last30.calls}</RegisterCell><RegisterCell>{tokens(a.last30.tokens)}</RegisterCell>
      <RegisterCell>{sgd(a.last30.sgd)}</RegisterCell><RegisterCell last><span className="text-trs-muted">{sgd(a.previous.sgd)}</span></RegisterCell>
    </RegisterRow>
  )
  return (
    <PageFrame>
      <PageHeader title="Usage" meta={`Last 30 days · S$${total.toFixed(2)} · ${calls.toLocaleString('en-SG')} calls · S$ at ${'1.35'} per US$`} />
      <Register label="By agent" minWidth={760}>
        <RegisterHead><RegisterTh first width={260}>By agent</RegisterTh><RegisterTh>Key</RegisterTh><RegisterTh>Calls</RegisterTh><RegisterTh>Tokens</RegisterTh><RegisterTh>S$</RegisterTh><RegisterTh last>Before</RegisterTh></RegisterHead>
        <tbody>
          {place.agents.map(row)}
          {place.unattributed.calls > 0 && (
            <RegisterRow><RegisterCell first primary="Unattributed" align="left" /><RegisterCell>–</RegisterCell><RegisterCell>{place.unattributed.calls}</RegisterCell><RegisterCell>{tokens(place.unattributed.tokens)}</RegisterCell><RegisterCell>{sgd(place.unattributed.sgd)}</RegisterCell><RegisterCell last>–</RegisterCell></RegisterRow>
          )}
        </tbody>
      </Register>
      <Register label="By model" minWidth={560}>
        <RegisterHead><RegisterTh first width={260}>By model</RegisterTh><RegisterTh>Agents</RegisterTh><RegisterTh>Calls</RegisterTh><RegisterTh last>S$</RegisterTh></RegisterHead>
        <tbody>{place.byModel.map(m => <RegisterRow key={m.model}><RegisterCell first primary={m.model} align="left" /><RegisterCell>{m.agents}</RegisterCell><RegisterCell>{m.tally.calls}</RegisterCell><RegisterCell last>{sgd(m.tally.sgd)}</RegisterCell></RegisterRow>)}</tbody>
      </Register>
    </PageFrame>
  )
}

export function KnowledgeTable({ rows, readers = false }: { rows: KnowledgeRow[]; readers?: boolean }) {
  return (
    <Register label="Knowledge" minWidth={readers ? 900 : 640}>
      <RegisterHead>
        <RegisterTh first width={260}>Knowledge</RegisterTh><RegisterTh>Source</RegisterTh>{readers && <RegisterTh>Read by</RegisterTh>}<RegisterTh>Version</RegisterTh><RegisterTh last> </RegisterTh>
      </RegisterHead>
      <tbody>
        {rows.map(k => (
          <RegisterRow key={k.key}>
            <RegisterCell first primary={k.title} align="left" />
            <RegisterCell>{k.kind === 'drive' ? <Chip tone="blue">Drive folder</Chip> : <Chip>Text</Chip>}</RegisterCell>
            {readers && <RegisterCell nowrap={false}><span className="inline-flex flex-wrap justify-center gap-1">{k.readers.map(r => <Chip key={r}>{r}</Chip>)}</span></RegisterCell>}
            <RegisterCell>{k.kind === 'drive' ? '–' : k.version ? `Version ${k.version}` : 'Not saved'}</RegisterCell>
            <RegisterCell last>
              {k.kind === 'drive'
                ? (k.driveUrl ? <a href={k.driveUrl} target="_blank" rel="noreferrer" className="text-small text-trs-ink underline underline-offset-4">Open folder</a> : '–')
                : <Link href={`/agents/knowledge/${k.key}`} className="text-small text-trs-ink underline underline-offset-4">Edit</Link>}
            </RegisterCell>
          </RegisterRow>
        ))}
      </tbody>
    </Register>
  )
}

export function KnowledgePlace({ rows }: { rows: KnowledgeRow[] }) {
  return (
    <PageFrame>
      <PageHeader title="Knowledge" meta={`${rows.length} sources · ${rows.filter(r => r.kind === 'text' && r.version).length} texts saved`} />
      <KnowledgeTable rows={rows} readers />
    </PageFrame>
  )
}

export function KnowledgeDoc({ k, versions }: { k: KnowledgeRow; versions: DocVersion[] }) {
  return (
    <PageFrame>
      <Breadcrumbs current={{ label: k.title, href: `/agents/knowledge/${k.key}` }} fallback={{ label: 'Knowledge', href: '/agents/knowledge' }} />
      <PageHeader title={k.title} meta={k.key === 'tone' ? 'Read by every agent, on calls that write prose' : `Read by ${k.readers.join(', ')}`} />
      <DocEditor docKey={`kn:${k.key}`} title="Text" versions={versions} draft={DRAFTS[`kn:${k.key}`] ?? ''} />
    </PageFrame>
  )
}
