import { describe, it, expect, vi, beforeEach } from 'vitest'

const gatewayReads = vi.fn(async (calls: { area: string; url: string }[]) =>
  calls.map(c => ({ status: 200, body: JSON.stringify({ url: c.url }), type: 'application/json' })))
vi.mock('@/app/gateway-batch', () => ({ gatewayReads: (c: { area: string; url: string }[]) => gatewayReads(c) }))

import { actionFetch, resetActionReads } from '@/lib/action-fetch'

const call = vi.fn(async (url: string, method: string) => ({ status: 200, body: JSON.stringify({ url, method }), type: 'application/json' }))

describe('actionFetch', () => {
  beforeEach(() => { gatewayReads.mockClear(); call.mockClear(); resetActionReads() })

  it('sends reads made together as one action, each answer to its caller', async () => {
    const f = actionFetch(call, 'inbox'), g = actionFetch(call, 'today')
    const got = await Promise.all([f('/api/a'), g('/api/b'), f('/api/c')].map(p => p.then(r => r.json())))
    expect(gatewayReads).toHaveBeenCalledTimes(1)
    expect(gatewayReads.mock.calls[0][0]).toEqual([{ area: 'inbox', url: '/api/a' }, { area: 'today', url: '/api/b' }, { area: 'inbox', url: '/api/c' }])
    expect(got.map(x => x.url)).toEqual(['/api/a', '/api/b', '/api/c'])
    expect(call).not.toHaveBeenCalled()
  })

  it('reads made while a batch is out go together in the next one', async () => {
    let release!: () => void
    gatewayReads.mockImplementationOnce(async calls => { await new Promise<void>(r => { release = r }); return calls.map(c => ({ status: 200, body: JSON.stringify({ url: c.url }), type: 'application/json' })) })
    const f = actionFetch(call, 'inbox')
    const first = f('/api/1')
    await new Promise(r => setTimeout(r, 5))
    const later = [f('/api/2'), f('/api/3')]
    await new Promise(r => setTimeout(r, 5))
    release()
    await Promise.all([first, ...later])
    expect(gatewayReads).toHaveBeenCalledTimes(2)
    expect(gatewayReads.mock.calls[1][0].map((c: { url: string }) => c.url)).toEqual(['/api/2', '/api/3'])
  })

  it('a write goes alone through its own action', async () => {
    const f = actionFetch(call, 'inbox')
    const r = await f('/api/x', { method: 'POST', body: '{}' })
    expect(await r.json()).toEqual({ url: '/api/x', method: 'POST' })
    expect(gatewayReads).not.toHaveBeenCalled()
  })

  it('a failed batch fails each read in it', async () => {
    gatewayReads.mockRejectedValueOnce(new Error('offline'))
    const f = actionFetch(call, 'inbox')
    await expect(f('/api/a')).rejects.toThrow('offline')
  })
})
