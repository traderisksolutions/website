import { describe, expect, it } from 'vitest'
import { AGENT_KNOWLEDGE, composeGuidance, DRAFTS, KNOWLEDGE, keysOfAgent, type DocVersion } from '@/lib/agents/knowledge'
import { AGENTS } from '@/lib/ai-agents'

const v = (doc_key: string, version: number, body: string): DocVersion => ({ doc_key, version, body, created_by: 'x', created_at: '' })

describe('agent instructions and knowledge', () => {
  it('every agent has a knowledge list and a draft of its instructions', () => {
    for (const id of Object.keys(AGENTS)) {
      expect(AGENT_KNOWLEDGE[id as keyof typeof AGENT_KNOWLEDGE]).toBeDefined()
      expect(DRAFTS[`agent:${id}`]).toBeTruthy()
    }
    for (const k of KNOWLEDGE) if (k.kind === 'text') expect(DRAFTS[`kn:${k.key}`]).toBeTruthy()
    for (const k of KNOWLEDGE) if (k.kind !== 'text') expect(DRAFTS[`kn:${k.key}`]).toBeUndefined()
  })

  it('nothing is added until a version is saved; drafts are never sent', () => {
    expect(composeGuidance('crm', new Map(), false)).toEqual({ text: '', versions: {} })
  })

  it('a call carries the agent\'s instructions and its knowledge texts; panels and other agents\' texts add nothing', () => {
    const inForce = new Map([
      ['agent:crm', v('agent:crm', 3, 'Draft only.')], ['kn:tone', v('kn:tone', 2, 'Kept in its panel.')],
      ['kn:policies', v('kn:policies', 1, 'Register is the source.')], ['kn:insurers', v('kn:insurers', 1, 'Not read by crm.')],
    ])
    const c = composeGuidance('crm', inForce, false)
    expect(c.text).toBe('Instructions and guardrails (version 3):\nDraft only.\n\nPolicy register (version 1):\nRegister is the source.')
    expect(c.versions).toEqual({ 'agent:crm': 3, 'kn:policies': 1 })
    expect(composeGuidance('crm', inForce, true)).toEqual(c)
  })

  it('Drive sources and panels add nothing to the call; an agent reads only its own keys', () => {
    const inForce = new Map([['kn:brochures', v('kn:brochures', 1, 'x')]])
    expect(composeGuidance('pricingmatrix', inForce, false).text).toBe('')
    expect(keysOfAgent('crm')).toEqual(['agent:crm', 'kn:policies'])
  })
})
