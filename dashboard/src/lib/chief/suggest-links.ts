/** What a done suggestion shows. Pure, so client components import it without the server module. */
export type SuggestionKind = 'eb_scenarios'
export const doneSummary = (s: { done: { members: number; summary?: string } | null }) => s.done?.summary ?? `${s.done?.members ?? 0} members priced`
