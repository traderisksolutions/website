import { cn } from '@/lib/utils'

/**
 * Generalizes TFE's tier-badge.tsx pattern (Record<Status,{className}> → pill) into a
 * config-driven component instead of a hardcoded union, because Pricing Matrix alone needs
 * three independent status vocabularies (calculator status, reconciliation-issue status,
 * taxonomy-synonym status). Scoped to Pricing Matrix — the existing global status-badge.tsx
 * already covers contacts/campaigns/debit-notes and isn't extended here.
 */

export type StatusPillConfig<K extends string> = Record<K, { label: string; className: string }>

/** `status` deliberately accepts plain `string` (not narrowed to K) — callers are almost always
 *  rendering a DB column typed `string`, not a literal union; the config lookup falls back to
 *  showing the raw value for anything unrecognized rather than being a type error at the call site. */
export function StatusPill<K extends string>({ status, config, className }: {
  status: string
  config: StatusPillConfig<K>
  className?: string
}) {
  const cfg = (config as Record<string, { label: string; className: string } | undefined>)[status]
  return (
    <span className={cn('st-badge', cfg?.className ?? 'bg-slate-100 text-slate-500', className)}>
      {cfg?.label ?? status}
    </span>
  )
}

// Shared vocab for pm_calculators.status — used by the calculator list and the review page.
export const CALCULATOR_STATUS: StatusPillConfig<'draft' | 'extracting' | 'mapping' | 'in_review' | 'approved' | 'archived'> = {
  draft:      { label: 'Draft',      className: 'bg-slate-100 text-slate-600' },
  extracting: { label: 'Extracting…', className: 'bg-amber-100 text-amber-700' },
  mapping:    { label: 'Extracting…', className: 'bg-amber-100 text-amber-700' },
  in_review:  { label: 'In review',  className: 'bg-indigo-100 text-indigo-700' },
  approved:   { label: 'Approved',   className: 'bg-emerald-100 text-emerald-700' },
  archived:   { label: 'Archived',   className: 'bg-slate-100 text-slate-400' },
}

// pm_reconciliation_issues.status and pm_taxonomy_synonyms.status share the same three-state shape.
export const REVIEW_STATUS: StatusPillConfig<'open' | 'pending' | 'resolved' | 'approved' | 'dismissed' | 'rejected'> = {
  open:      { label: 'Open',      className: 'bg-amber-100 text-amber-700' },
  pending:   { label: 'Pending',   className: 'bg-amber-100 text-amber-700' },
  resolved:  { label: 'Resolved',  className: 'bg-emerald-100 text-emerald-700' },
  approved:  { label: 'Approved',  className: 'bg-emerald-100 text-emerald-700' },
  dismissed: { label: 'Dismissed', className: 'bg-slate-100 text-slate-400' },
  rejected:  { label: 'Rejected',  className: 'bg-slate-100 text-slate-400' },
}

// pm_computation_rules.status — its own independent approval lifecycle (see plan §Decisions).
export const RULES_STATUS: StatusPillConfig<'draft' | 'in_review' | 'approved' | 'archived'> = {
  draft:     { label: 'Draft',     className: 'bg-slate-100 text-slate-600' },
  in_review: { label: 'In review', className: 'bg-indigo-100 text-indigo-700' },
  approved:  { label: 'Approved',  className: 'bg-emerald-100 text-emerald-700' },
  archived:  { label: 'Archived',  className: 'bg-slate-100 text-slate-400' },
}
