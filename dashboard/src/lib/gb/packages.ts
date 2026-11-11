/**
 * The package ladder: five named packages between the insurer's plan codes and the engine's
 * numbers (Jarod, 12 Nov 2026). A client reads a name and five facts; the engine prices the
 * package's requirement at every insurer through the same ladder as the plan builder; the broker
 * can still override any cell with a plan code.
 *
 *   Essential   government 4-bed, each stay to S$15k
 *   Standard    private 4-bed, each stay to S$15k, major medical for serious cases
 *   Enhanced    private 2-bed, each stay to S$20k, major medical
 *   Executive   private single room, each stay to S$25k to 30k, major medical, better riders
 *   Premier     private single room, everything as charged to S$200k to 300k a year
 *
 * Pure. No I/O.
 */
import type { Requirement, Ward } from './ladder'
import type { CoverSpec } from './plan-rules'

export type PackageKey = 'essential' | 'standard' | 'enhanced' | 'executive' | 'premier'

export type Package = {
  key: PackageKey
  name: string
  /** The five facts a client reads. */
  facts: string[]
  requirement: Requirement
}

export const PACKAGES: Package[] = [
  {
    key: 'essential', name: 'Essential',
    facts: ['Government restructured hospital, 4-bed ward', 'Each hospital stay covered to S$15,000', 'GP free at panel clinics', 'Specialist to S$1,000 a year', 'Life cover S$50,000'],
    requirement: { ward: 'G4', wardLevel: 'entry', gmm: false, gp: 'nil', sp: 'entry', dental: null, pa: null, gtl: 50_000, gci: null, deps: 'medical' },
  },
  {
    key: 'standard', name: 'Standard',
    facts: ['Private hospital, 4-bed ward', 'Each hospital stay covered to S$15,000', 'Serious cases: major medical to S$60,000 more, 20% shared', 'GP free at panel clinics; specialist to S$1,500; dental to S$500', 'Life cover S$100,000'],
    requirement: { ward: 'P4', wardLevel: 'entry', gmm: true, gp: 'nil', sp: 'entry', dental: 'entry', pa: null, gtl: 100_000, gci: null, deps: 'medical' },
  },
  {
    key: 'enhanced', name: 'Enhanced',
    facts: ['Private hospital, 2-bed ward', 'Each hospital stay covered to S$20,000', 'Serious cases: major medical to S$80,000 more, 20% shared', 'GP free at panel clinics; specialist to S$2,000; dental to S$800', 'Life cover S$100,000'],
    requirement: { ward: 'P2', wardLevel: 'entry', gmm: true, gp: 'nil', sp: 'entry', dental: 'entry', pa: null, gtl: 100_000, gci: null, deps: 'medical' },
  },
  {
    key: 'executive', name: 'Executive',
    facts: ['Private hospital, single room', 'Each hospital stay covered to S$25,000 to 30,000', 'Serious cases: major medical to S$100,000 more, 20% shared', 'GP free at any clinic; specialist to S$3,000; dental to S$1,000', 'Life cover S$200,000'],
    requirement: { ward: 'P1', wardLevel: 'entry', gmm: true, gp: 'nil', sp: 'top', dental: 'top', pa: null, gtl: 200_000, gci: null, deps: 'medical' },
  },
  {
    key: 'premier', name: 'Premier',
    facts: ['Private hospital, single room', 'Everything as charged to S$200,000 to 300,000 a year', 'No cap per stay, no co-insurance', 'GP free at any clinic; specialist to S$5,000; dental to S$1,500', 'Life cover S$300,000'],
    requirement: { ward: 'P1', wardLevel: 'top', gmm: false, gp: 'nil', sp: 'top', dental: 'top', pa: null, gtl: 300_000, gci: null, deps: 'medical' },
  },
]

export const packageByKey = (key: string | null | undefined): Package | null => PACKAGES.find(p => p.key === key) ?? null
export const rungOf = (key: PackageKey): number => PACKAGES.findIndex(p => p.key === key)

/**
 * The rung a current plan sits on, from the facts the census sheet or the thread gave. The ward
 * decides; the annual-limit plan is Premier. Null when nothing is known.
 */
export function rungForCurrent(current: Partial<Requirement> | null | undefined): PackageKey | null {
  if (!current?.ward) return null
  if (current.ward === 'P1') return current.wardLevel === 'top' ? 'premier' : 'executive'
  const byWard: Record<Ward, PackageKey> = { G4: 'essential', G1: 'essential', P4: 'standard', P2: 'enhanced', P1: 'executive' }
  return byWard[current.ward]
}

/** The suggested rung: the current plan's rung at a renewal, else Standard. */
export function suggestedRung(basis: 'new_business' | 'renewal', current: Partial<Requirement> | null | undefined): { key: PackageKey; because: string } {
  const r = rungForCurrent(current)
  if (basis === 'renewal' && r) return { key: r, because: 'the rung the current plan sits on' }
  return { key: 'standard', because: basis === 'renewal' ? 'the current plan is not on file; Standard is the common SME package' : 'the common SME package for a first programme' }
}

/** The covers a package asks for, in the intake agent's shape, so draftQuotation prices it. */
export function packageCovers(p: Package): CoverSpec[] {
  const r = p.requirement
  const hospital = r.ward?.startsWith('G') ? 'government' : 'private'
  const ward = r.ward === 'P1' || r.ward === 'G1' ? 1 : r.ward === 'P2' ? 2 : 4
  const covers: CoverSpec[] = [{ code: 'GHS', hospital, ward, coPay: false, tier: r.wardLevel }]
  if (r.gmm) covers.push({ code: 'EMM', tier: r.wardLevel })
  if (r.gp) covers.push({ code: 'GOPC', coPay: r.gp === 'copay' })
  if (r.sp) covers.push({ code: 'GOSC', tier: r.sp })
  if (r.dental) covers.push({ code: 'GD', tier: r.dental })
  if (r.gtl) covers.push({ code: 'GTL', sumAssured: r.gtl })
  if (r.gci) covers.push({ code: 'GCI', sumAssured: r.gci })
  if (r.pa) covers.push({ code: 'GPA', sumAssured: r.pa })
  return covers
}
