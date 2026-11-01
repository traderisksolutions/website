import { describe, it, expect } from 'vitest'
import { classify, tierOf, withMailboxRule, type ClassifyInput } from './classify'
import { newText, similarity } from './text'

const kinds = new Map<string, string>([['acme-insure.example', 'insurer'], ['client-co.example', 'client'], ['partner-broker.example', 'partner']])
const msg = (over: Partial<ClassifyInput>): ClassifyInput => ({
  subject: 'Re: cover', body_text: '', from_address: 'broker@trade-risksol.com', attachments: [], recipients: [{ email: 'uw@acme-insure.example', role: 'to' }], ...over,
})

describe('newText', () => {
  it('cuts quoted history and the signature', () => {
    const t = newText('Noted, thank you.\n\nBest regards\nJane\n+65 6000 0000\n\nOn Mon, 3 Nov 2026 at 10:00, Someone <a@b.example> wrote:\n> old text')
    expect(t).toBe('Noted, thank you.')
  })
})

describe('classify', () => {
  it('a short thanks is an acknowledgement, deterministic', () => {
    const c = classify(msg({ body_text: 'Noted with thanks.' }), kinds)
    expect(c.cls).toBe('acknowledge'); expect(c.tier).toBe('deterministic')
  })
  it('a follow-up with no new content is a chase', () => {
    const c = classify(msg({ body_text: 'Hi, gentle reminder on the below. Any update?' }), kinds)
    expect(c.cls).toBe('chase'); expect(c.tier).toBe('deterministic')
  })
  it('a quote request to an insurer is a forward with approval', () => {
    const c = classify(msg({ subject: '(TRS) New client WICA', body_text: 'Please kindly quote for WICA for the attached proposal form. Headcount 12.', attachments: [{ filename: 'proposal.pdf' }] }), kinds)
    expect(c.cls).toBe('forward_client_to_insurer'); expect(c.sub).toBe('quote_request'); expect(c.tier).toBe('approval'); expect(c.side).toBe('market')
  })
  it('a policy document sent to a client is deterministic', () => {
    const c = classify(msg({ recipients: [{ email: 'hr@client-co.example', role: 'to' }], body_text: 'Please find attached the policy schedule for your records.', attachments: [{ filename: 'Policy Schedule 2026.pdf' }] }), kinds)
    expect(c.cls).toBe('document_send'); expect(c.tier).toBe('deterministic'); expect(c.side).toBe('client')
  })
  it('a debit note cover to a client is deterministic', () => {
    const c = classify(msg({ recipients: [{ email: 'accounts@client-co.example', role: 'to' }], body_text: 'Attached is our tax invoice TRS DN261001 for the renewal premium. Payment by 30 days.', attachments: [{ filename: 'TRS DN261001.pdf' }] }), kinds)
    expect(c.cls).toBe('debit_or_credit_note'); expect(c.sub).toBe('to_client'); expect(c.tier).toBe('deterministic')
  })
  it('a long coverage explanation to a client is person-only', () => {
    const body = 'To clarify, the policy does not cover losses arising from wear and tear. Under the policy, the exclusion in section 4 applies, which means that the claim for the corroded pipe would be excluded. In our view the sufficient cover would be a separate machinery breakdown policy, and we would recommend reviewing this at renewal with the insurer. Please note that the territorial limit is Singapore only.'
    const c = classify(msg({ recipients: [{ email: 'ops@client-co.example', role: 'to' }], body_text: body }), kinds)
    expect(c.cls).toBe('answer_question'); expect(c.tier).toBe('person')
  })
  it('mail with no outside recipient is internal', () => {
    const c = classify(msg({ recipients: [{ email: 'colleague@trade-risksol.com', role: 'to' }], body_text: 'FYI' }), kinds)
    expect(c.cls).toBe('internal'); expect(c.sub).toBe('fyi_forward')
  })
  it('the agents mailbox counts only when a person approved a draft', () => {
    const c = classify(msg({ from_address: 'operations@trade-risksol.com', body_text: 'Noted with thanks.' }), kinds)
    expect(withMailboxRule(c, 'operations@trade-risksol.com', false).tier).toBe('excluded')
    expect(withMailboxRule(c, 'operations@trade-risksol.com', true).cls).toBe('acknowledge')
    expect(classify(msg({ from_address: 'developer@trade-risksol.com', body_text: 'test' }), kinds).tier).toBe('excluded')
  })
  it('notes a side channel', () => {
    const c = classify(msg({ body_text: 'As discussed over the phone, please proceed to bind.' }), kinds)
    expect(c.sideChannel).toBe(true)
  })
  it('weights effort by words and files', () => {
    const c = classify(msg({ body_text: 'one two three', attachments: [{ filename: 'a.pdf' }, { filename: 'logo.png', mime_type: 'image/png' }] }), kinds)
    expect(c.attachments).toBe(1); expect(c.effort).toBe(10 + 40)
  })
})

describe('tierOf', () => {
  it('maps the study tiers', () => {
    expect(tierOf('acknowledge', '')).toBe('deterministic')
    expect(tierOf('acknowledge', 'holding_reply')).toBe('approval')
    expect(tierOf('forward_client_to_insurer', 'docs_or_info_to_insurer')).toBe('deterministic')
    expect(tierOf('forward_client_to_insurer', 'bind_or_proceed_instruction')).toBe('approval')
    expect(tierOf('claim_handling_substantive', '')).toBe('person')
    expect(tierOf('renewal_negotiation', '')).toBe('person')
  })
})

describe('similarity', () => {
  it('is 1 for the same words and falls with edits', () => {
    expect(similarity('please find attached the policy', 'please find attached the policy')).toBe(1)
    expect(similarity('please find attached the policy', 'please find attached the revised policy and wording')).toBeGreaterThan(0.5)
    expect(similarity('please find attached the policy', 'completely different words here now')).toBe(0)
  })
})
