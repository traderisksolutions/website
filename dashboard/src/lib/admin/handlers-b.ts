/** Phase B agents register here: claims, endorsements, endorsement_main, eb_movements, renewals, recipient_router, drafter, chaser. */
import { register } from '@/lib/agent-tasks/runner'
import { handleClaims } from './b/claims-agent'
import { handleDrafter } from './b/drafter'
import { handleChaser, handleRenewals } from './b/sweeps'
import { handleEbMovements, handleEndorsementMain, handleEndorsements } from './b/policy-agents'
import { handleRelay } from './b/relay/agent'

// The recipient router is a pure function the drafter calls (b/router.ts), not a queued agent:
// routing has no side effects, so a task for it would only add a hop.
register('claims', handleClaims)
register('drafter', handleDrafter)
register('chaser', handleChaser)
register('renewals', handleRenewals)
register('endorsement_main', handleEndorsementMain)
register('eb_movements', handleEbMovements)
register('endorsements', handleEndorsements)
register('relay', handleRelay)

export const PHASE_B_AGENTS = ['claims', 'drafter', 'chaser', 'renewals', 'endorsement_main', 'eb_movements', 'endorsements', 'relay'] as const
