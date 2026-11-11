/** Where a done suggestion opens. Pure, so client components import it without the server module. */
export type SuggestionKind = 'eb_scenarios'
export const doneHref = (_s: { kind: SuggestionKind }, quotationId: string) => `/pricing-matrix/quote/${quotationId}#scenarios`
export const doneLabel = (_s: { kind: SuggestionKind }) => 'Open estimate'
export const doneSummary = (s: { done: { members: number; summary?: string } | null }) => s.done?.summary ?? `${s.done?.members ?? 0} members priced`
