/** Every agent gets to be first in turn, so a slow agent at the front cannot starve the rest. */
import { describe, it, expect } from 'vitest'
import { rotateAgents } from '@/lib/agent-tasks/runner'

describe('rotateAgents', () => {
  it('starts each drain one agent later', () => {
    expect(rotateAgents(['a', 'b', 'c'], 0)).toEqual(['a', 'b', 'c'])
    expect(rotateAgents(['a', 'b', 'c'], 1)).toEqual(['b', 'c', 'a'])
    expect(rotateAgents(['a', 'b', 'c'], 5)).toEqual(['c', 'a', 'b'])
  })
  it('keeps every agent', () => {
    expect(rotateAgents(['a', 'b'], 7).sort()).toEqual(['a', 'b'])
    expect(rotateAgents([], 3)).toEqual([])
  })
})
