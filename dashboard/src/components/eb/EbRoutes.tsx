'use client'

/** Routes on /eb (docs/eb-v2.md step 2, G24): per house insurer, Brochure price or Insurer to quote, and why. */
import { useMemo } from 'react'
import { Chip } from '@/components/crm/primitives'
import { Register, RegisterCell, RegisterHead, RegisterRow, RegisterTh } from '@/components/ui/register'
import type { Member } from '@/lib/gb-quote'
import { ROUTE_PRODUCTS, routesFor } from '@/lib/gb/routes'

export function EbRoutes({ members, effectiveDate, warnings }: { members: Member[]; effectiveDate: string; warnings?: Record<string, string[]> }) {
  const routes = useMemo(() => routesFor(ROUTE_PRODUCTS, members, effectiveDate, warnings), [members, effectiveDate, warnings])
  return (
    <Register label="Routes" minWidth={760}>
      <RegisterHead>
        <RegisterTh first width={220}>Insurer</RegisterTh>
        <RegisterTh width={150}>Route</RegisterTh>
        <RegisterTh last>Why</RegisterTh>
      </RegisterHead>
      <tbody>
        {routes.map(r => (
          <RegisterRow key={r.product}>
            <RegisterCell first primary={r.product} align="left" />
            <RegisterCell>{r.route === 'brochure' ? <Chip tone="green">Brochure price</Chip> : <Chip tone="amber">Insurer to quote</Chip>}</RegisterCell>
            <RegisterCell last align="left" nowrap={false}>
              {[...r.reasons, ...r.notes].length ? [...r.reasons, ...r.notes].join(' · ') : 'Within the card'}
            </RegisterCell>
          </RegisterRow>
        ))}
      </tbody>
    </Register>
  )
}
