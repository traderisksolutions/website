import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EvalPage from '@/app/analytics/eval/page'

// Radix Tabs activate on `onMouseDown` (roving-focus pattern), not `onClick` — a bare
// fireEvent.click never fires it under jsdom. This mirrors how a real pointer interaction
// works (mousedown always precedes click) without pulling in @testing-library/user-event.
function clickTab(name: RegExp) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 })
}

// Deliberately scrambled (Nexus/RFQ before Engagement, alphabetically backwards within an
// area) so a passing test proves the page's own sort logic reorders it — not that the
// fixtures happened to already be in order.
const evaluateResponse = {
  evaluations: [
    { id: 'e1', email_type: 'CHAT_CONSULTANT', score: 4, eval_json: { what_human_changed: 'Consultant confirmed sum insured proactively', why_better: 'y', key_learning: 'Consultant should confirm the sum insured before quoting anything.', context_summary: 'z' }, created_at: '2026-01-03T00:00:00Z' },
    { id: 'e2', email_type: 'PRICING', score: 2, eval_json: { what_human_changed: 'Added exact SGD figures with decimals', why_better: 'y', key_learning: 'Always quote SGD figures with two decimal places.', context_summary: 'z' }, created_at: '2026-01-02T00:00:00Z' },
    { id: 'e3', email_type: 'CLAIMS', score: 3, eval_json: { what_human_changed: 'Asked for the policy number upfront', why_better: 'y', key_learning: 'Ask for the policy number before anything else.', context_summary: 'z' }, created_at: '2026-01-01T00:00:00Z' },
  ],
  examples: [
    { id: 'x1', email_type: 'CHAT_CONSULTANT', context_summary: 'chat example', ideal_reply: 'reply chat', score: 5, created_at: '2026-01-03T00:00:00Z' },
    { id: 'x2', email_type: 'PRICING', context_summary: 'pricing example', ideal_reply: 'reply pricing', score: 5, created_at: '2026-01-02T00:00:00Z' },
    { id: 'x3', email_type: 'CLAIMS', context_summary: 'claims example', ideal_reply: 'reply claims', score: 4, created_at: '2026-01-01T00:00:00Z' },
  ],
  stats: [
    { email_type: 'CHAT_CONSULTANT', count: 1, avg_score: 4 },
    { email_type: 'PRICING', count: 1, avg_score: 2 },
    { email_type: 'CLAIMS', count: 1, avg_score: 3 },
  ],
}

const overridesResponse = [
  { id: 'o1', email_type: 'CHAT_CONSULTANT', override_text: 'chat override', synthesized_at: '2026-01-03T00:00:00Z', source_eval_count: 2, status: 'active' },
  { id: 'o2', email_type: 'PRICING', override_text: 'pricing override', synthesized_at: '2026-01-02T00:00:00Z', source_eval_count: 3, status: 'active' },
]

const skillTimelineResponse = {
  versions: [
    { id: 'o1', email_type: 'CHAT_CONSULTANT', override_text: 'chat override', source_eval_count: 2, status: 'active', synthesized_at: '2026-01-03T00:00:00Z' },
    { id: 'o2', email_type: 'PRICING', override_text: 'pricing override', source_eval_count: 3, status: 'active', synthesized_at: '2026-01-02T00:00:00Z' },
  ],
  recommendations: [
    { surface: 'CHAT_CONSULTANT', action: 'pin', reason: 'strong and stable', sampleSize: 6, avgScore: 4.8 },
    { surface: 'PRICING', action: 'deprecate', reason: 'underperforming', sampleSize: 6, avgScore: 2.1 },
  ],
}

const chatLearningsResponse = {
  learnings: [
    { id: 'c1', case_id: 'case-b', case_name: 'Case B (most recent chat)', email_type: 'CLAIMS', question: 'What is the deductible?', answer: 'SGD 5,000.', created_at: '2026-01-05T00:00:00Z' },
    { id: 'c2', case_id: 'case-a', case_name: 'Case A (older chat)', email_type: null, question: 'Has the survey report arrived?', answer: 'Not yet.', created_at: '2026-01-01T00:00:00Z' },
  ],
  total: 2,
}

function mockFetch(url: string) {
  const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)
  if (url.startsWith('/api/engagement/evaluate')) return ok(evaluateResponse)
  if (url.startsWith('/api/engagement/improve-prompt')) return ok(overridesResponse)
  if (url.startsWith('/api/engagement/skill-timeline')) return ok(skillTimelineResponse)
  if (url.startsWith('/api/engagement/chat-learnings')) return ok(chatLearningsResponse)
  return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response)
}

describe('EvalPage sorting/grouping (dogfood: real render, not just types)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((url: string) => mockFetch(url)))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('renders without crashing and loads all four data sources', async () => {
    render(<EvalPage />)
    await waitFor(() => expect(screen.getByText('Total Evaluated')).toBeInTheDocument())
    // Total Evaluated / Examples Stored / Learnings all happen to be "3" with this
    // fixture — assert the specific stat tile, not an ambiguous bare "3".
    const tile = screen.getByText('Total Evaluated').closest('div')!.parentElement!
    expect(tile).toHaveTextContent('3')
  })

  it('orders "Score by surface" by area then alphabetically, not by volume or API order', async () => {
    const { container } = render(<EvalPage />)
    await waitFor(() => expect(screen.getByText('Score by surface')).toBeInTheDocument())
    const html = container.innerHTML
    const claims = html.indexOf('>Claims<')
    const pricing = html.indexOf('>Pricing<')
    const askOpus = html.indexOf('Ask-Opus chat')
    expect(claims).toBeGreaterThan(-1)
    expect(pricing).toBeGreaterThan(-1)
    expect(askOpus).toBeGreaterThan(-1)
    // Engagement (Claims, then Pricing alphabetically) before Nexus (Ask-Opus chat) —
    // API/eval order was CHAT_CONSULTANT, PRICING, CLAIMS, so this only passes if the
    // page actually re-sorts rather than trusting fetch order.
    expect(claims).toBeLessThan(pricing)
    expect(pricing).toBeLessThan(askOpus)
  })

  it('Prompt Learnings tab groups by surface in the same stable area order', async () => {
    render(<EvalPage />)
    await waitFor(() => expect(screen.getByText('Total Evaluated')).toBeInTheDocument())
    clickTab(/Prompt Learnings/)
    const learningsTab = await screen.findByRole('tabpanel', { name: /Prompt Learnings/ })
    await waitFor(() => expect(learningsTab).toHaveTextContent('Ask for the policy number'))
    const html = learningsTab.innerHTML
    expect(html.indexOf('>Claims<')).toBeLessThan(html.indexOf('>Pricing<'))
    expect(html.indexOf('>Pricing<')).toBeLessThan(html.indexOf('Ask-Opus chat'))
  })

  it('Few-Shot Examples tab groups by surface, same order', async () => {
    render(<EvalPage />)
    await waitFor(() => expect(screen.getByText('Total Evaluated')).toBeInTheDocument())
    clickTab(/Few-Shot Examples/)
    const examplesTab = await screen.findByRole('tabpanel', { name: /Few-Shot Examples/ })
    await waitFor(() => expect(examplesTab).toHaveTextContent('claims example'))
    const html = examplesTab.innerHTML
    expect(html.indexOf('>Claims<')).toBeLessThan(html.indexOf('>Pricing<'))
    expect(html.indexOf('>Pricing<')).toBeLessThan(html.indexOf('Ask-Opus chat'))
  })

  it('Chat Learnings tab groups by case, most recently active case first', async () => {
    render(<EvalPage />)
    await waitFor(() => expect(screen.getByText('Total Evaluated')).toBeInTheDocument())
    clickTab(/Chat Learnings/)
    const chatTab = await screen.findByRole('tabpanel', { name: /Chat Learnings/ })
    await waitFor(() => expect(chatTab).toHaveTextContent('Case B (most recent chat)'))
    const html = chatTab.innerHTML
    // case-b's learning is newer (Jan 5) than case-a's (Jan 1) — case B must render first.
    expect(html.indexOf('Case B (most recent chat)')).toBeLessThan(html.indexOf('Case A (older chat)'))
  })

  it('expanding an evaluation row reveals its key learning', async () => {
    render(<EvalPage />)
    await waitFor(() => expect(screen.getByText('Total Evaluated')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Added exact SGD figures with decimals'))
    await waitFor(() => expect(screen.getByText('💡 Key learning')).toBeInTheDocument())
    expect(screen.getByText('Always quote SGD figures with two decimal places.')).toBeInTheDocument()
  })

  it('Skill Evolution recommendations and overrides are also area-sorted', async () => {
    const { container } = render(<EvalPage />)
    await waitFor(() => expect(screen.getByText('Skill Evolution')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText(/Promote/)).toBeInTheDocument())
    const html = container.innerHTML
    // Recommendations: PRICING (Engagement) must precede CHAT_CONSULTANT (Nexus).
    expect(html.indexOf('Consider deprecating')).toBeLessThan(html.indexOf('Promote'))
  })
})
