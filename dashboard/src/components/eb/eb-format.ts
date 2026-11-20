import { money } from '@/lib/format'

/** Money as /eb shows it, whole dollars: "S$12,304"; "—" for nothing. */
export const fmtMoney0 = (n: number | null | undefined) => money(n, { dp: 0 })
/** A difference with its sign, never coloured (EB-059): "−S$1,200", "+S$800", "S$0". */
export const fmtSigned = (d: number) => { const r = Math.round(d); return r === 0 ? 'S$0' : `${r < 0 ? '−' : '+'}${money(Math.abs(r), { dp: 0 })}` }
