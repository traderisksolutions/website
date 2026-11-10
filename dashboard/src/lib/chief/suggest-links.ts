/** Where a done suggestion opens. Pure, so client components import it without the server module. */
export type SuggestionKind = 'price_census' | 'eb_scenarios'
export const doneHref = (s: { kind: SuggestionKind }, quotationId: string) => (s.kind === 'eb_scenarios' ? `/pricing-matrix/quote/${quotationId}#scenarios` : `/pricing-matrix/quote/${quotationId}/plans`)
export const doneLabel = (s: { kind: SuggestionKind }) => (s.kind === 'eb_scenarios' ? 'Open pricing options' : 'Open plans')
export const doneSummary = (s: { done: { members: number; summary?: string } | null }) => s.done?.summary ?? `Priced from this file · ${s.done?.members ?? 0} members`
