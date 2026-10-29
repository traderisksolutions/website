'use client'

import { Chip } from '@/components/crm/primitives'
import { ACCOUNT_LABEL, ACTION_LABEL, EMAIL_LABEL, OUTREACH_LABEL, type AccountStatus, type EmailStatus, type OutreachStatus, type RecommendedAction } from '@/lib/sales/types'

// State is a word in a neutral chip, never a colour (house rule).

export function OutreachChip({ status }: { status: OutreachStatus | null | undefined }) {
  const s = status && status in OUTREACH_LABEL ? status : 'none'
  return <Chip>{OUTREACH_LABEL[s]}</Chip>
}

export function EmailChip({ status, hasEmail = true }: { status: string | null | undefined; hasEmail?: boolean }) {
  const s = !hasEmail ? 'none' : status && status in EMAIL_LABEL ? (status as EmailStatus) : 'unknown'
  return <Chip>{EMAIL_LABEL[s]}</Chip>
}

export function ActionChip({ action }: { action: RecommendedAction | null | undefined }) {
  if (!action || !(action in ACTION_LABEL)) return <span style={{ color: '#8c958f' }}>–</span>
  return <Chip>{ACTION_LABEL[action]}</Chip>
}

export function AccountChip({ status }: { status: AccountStatus | null | undefined }) {
  if (!status || !(status in ACCOUNT_LABEL)) return null
  return <Chip>{ACCOUNT_LABEL[status]}</Chip>
}

export function FlagChip({ flag }: { flag: string }) {
  return <Chip>{flag.replace(/[_-]+/g, ' ')}</Chip>
}
