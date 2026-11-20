import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CommissionCheck, type CommissionState } from '@/components/email/CommissionCheck'

const pdf = { filename: 'AIA quote.pdf', mime_type: 'application/pdf', storage_url: 'drivefile:orig' }
const ours = { filename: 'Proposal V2.pdf', mime_type: 'application/pdf', storage_url: 'drivefile:ours' }
const copy = { filename: 'AIA quote (client copy).pdf', mime_type: 'application/pdf', storage_url: 'drivefile:copy' }

function mockFetch() {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    calls.push({ url, body })
    if (url === '/api/audit-log') return new Response('{}')
    const blanked = body.storage_url === 'drivefile:orig'
    return new Response(JSON.stringify(blanked
      ? { status: 'blanked', hits: [{ page: 2, text: 'Commission 15% SGD 1,500' }], reason: null, client_copy: copy }
      : { status: 'clean', hits: [], reason: null, client_copy: null }))
  }))
  return calls
}
afterEach(() => vi.unstubAllGlobals())

describe('CommissionCheck', () => {
  it('a clean file is ready without a tick', async () => {
    mockFetch()
    const states: CommissionState[] = []
    render(<CommissionCheck attachments={[ours]} onChange={s => states.push(s)} />)
    await screen.findByText(/No commission found/)
    expect(states.at(-1)).toEqual({ ready: true, attachments: [ours] })
  })

  it('a blanked file sends its client copy, and only after the tick, which is logged', async () => {
    const calls = mockFetch()
    const states: CommissionState[] = []
    render(<CommissionCheck attachments={[pdf, ours]} onChange={s => states.push(s)} context={{ resource_type: 'eb_quotation', resource_id: 'q1' }} />)
    await screen.findByText(/Commission found in AIA quote.pdf: 1 line blanked, page 2/)
    expect(screen.getByText('Preview client copy').getAttribute('href')).toContain('drivefile%3Acopy')
    await waitFor(() => expect(states.at(-1)?.attachments).toEqual([copy, ours]))
    expect(states.at(-1)?.ready).toBe(false)
    fireEvent.click(screen.getByLabelText('Checked: no commission in this file'))
    await waitFor(() => expect(states.at(-1)?.ready).toBe(true))
    const logged = calls.find(c => c.url === '/api/audit-log')
    expect(logged?.body).toMatchObject({ action: 'attachment.commission_confirmed', resource_type: 'eb_quotation', resource_id: 'q1', new_value: { file: 'AIA quote.pdf', status: 'blanked', client_copy: 'drivefile:copy' } })
  })
})
