/**
 * Spend is attributed by mapping a logged `feature` onto an agent, so a feature missing from
 * FEATURE_AGENT lands in `unattributed` — visible on the spend page, but useless for answering
 * "what does the pricing matrix cost us". These tests exist because that failure is silent.
 */
import { describe, it, expect } from 'vitest'
import { AGENTS, FEATURE_AGENT, agentOfFeature, agentLabel, type AgentId } from '@/lib/ai-agents'

describe('agent registry', () => {
  it('gives every agent its own key, so spend can be read per agent', () => {
    const keys = Object.values(AGENTS).map(a => a.envKey)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k).toMatch(/^GEMINI_API_KEY_[A-Z_]+$/)
  })

  it('has a label for every id, including unattributed', () => {
    const ids: AgentId[] = ['housekeeping', 'crm', 'askai', 'pricingmatrix', 'group_benefit', 'placement', 'benefits_admin', 'unattributed']
    for (const id of ids) expect(agentLabel(id)).toBeTruthy()
  })

  it('maps every feature to a declared agent', () => {
    const declared = new Set<string>([...Object.keys(AGENTS), 'unattributed'])
    for (const [feature, agent] of Object.entries(FEATURE_AGENT)) {
      expect(declared.has(agent), `${feature} -> ${agent}`).toBe(true)
    }
  })

  it('attributes every pricing matrix feature, after the move off Opus', () => {
    for (const f of ['pm_rate_extract', 'pm_rate_extract_adjudicate', 'pm_benefit_extract',
                     'pm_rules_extract', 'pm_shape_detect', 'pm_plan_match',
                     'pm_classify_categories', 'pm_recommend']) {
      expect(agentOfFeature(f)).toBe('pricingmatrix')
    }
  })

  it('attributes the annual rate ingest to Pricing Matrix', () => {
    for (const f of ['gb_extract_schedule', 'gb_alias_suggest', 'gb_rules_extract']) {
      expect(agentOfFeature(f)).toBe('pricingmatrix')
    }
  })

  it('attributes per-request work to the group benefits agent, on its own key', () => {
    for (const f of ['gb_intake_extract', 'gb_plan_match', 'gb_value_explain']) {
      expect(agentOfFeature(f)).toBe('group_benefit')
    }
    expect(AGENTS.group_benefit.envKey).toBe('GEMINI_API_KEY_GROUP_BENEFIT')
  })

  it('attributes every placement feature to the placement agent, on its own key', () => {
    for (const f of ['placement_intake', 'placement_dispatch_draft', 'placement_reply_read',
                     'placement_client_change', 'placement_chase_draft', 'placement_client_summary']) {
      expect(agentOfFeature(f)).toBe('placement')
    }
    expect(AGENTS.placement.envKey).toBe('GEMINI_API_KEY_PLACEMENT')
  })

  it('attributes every benefits admin feature to its own agent and key', () => {
    for (const f of ['policy_movement_classify', 'policy_movement_read', 'policy_note_read', 'policy_movement_draft']) {
      expect(agentOfFeature(f)).toBe('benefits_admin')
    }
    expect(AGENTS.benefits_admin.envKey).toBe('GEMINI_API_KEY_BENEFITS_ADMIN')
    expect(AGENTS.benefits_admin.model).toBe('gemini-3.8-flash')
  })

  it('reports an unknown feature as unattributed rather than guessing', () => {
    expect(agentOfFeature('something_new')).toBe('unattributed')
    expect(agentOfFeature(null)).toBe('unattributed')
  })

  it('keeps the two pricing matrix readings on different models', () => {
    // The whole value of that stage is that two independent reads must agree. If reading A and
    // reading B were the same model, the cross-check would confirm nothing.
    expect(AGENTS.pricingmatrix.model).toBe('gemini-3.8-flash')
  })
})
