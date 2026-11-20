/** Small pieces shared by the Renewals pages (docs/renewals.md). */
import { Chip } from '@/components/crm/primitives'
import type { StageTone } from '@/lib/crm/types'
import { RISK_NAME, type RiskFlag } from '@/lib/renewals/pipeline'
import { STAGE_NAME, type Stage } from '@/lib/renewals/rules'

const STAGE_TONE: Record<Stage, StageTone> = {
  open: 'neutral', data_asked: 'blue', marketing: 'blue', quotes_in: 'amber', proposed: 'amber', instructed: 'green', renewed: 'green', lost: 'red',
}

export const StageChip = ({ stage }: { stage: Stage }) => <Chip tone={STAGE_TONE[stage] ?? 'neutral'}>{STAGE_NAME[stage] ?? stage}</Chip>
export const RiskChips = ({ risk }: { risk: readonly RiskFlag[] }) => <>{risk.map(f => <Chip key={f} tone="red">{RISK_NAME[f]}</Chip>)}</>

/** An owner's email as a first name: nathan.b@… → Nathan. */
export const ownerName = (email: string | null | undefined): string => {
  if (!email) return '—'
  const f = email.split('@')[0].split(/[._-]/)[0]
  return f.charAt(0).toUpperCase() + f.slice(1)
}

export const plainDays = (days: number): string => (days < 0 ? `${-days} days ago` : days === 0 ? 'today' : `${days} days`)
