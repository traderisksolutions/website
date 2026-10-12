// Display words for the Marketing screens. State is a word, never a colour.
export { fmtDate, fmtDay, n } from '@/lib/sales/labels'

export const ARTICLE_STATUS_LABEL: Record<string, string> = { draft: 'Draft', pending: 'Awaiting approval', published: 'Published', archived: 'Archived' }
export const CATEGORY_LABEL: Record<string, string> = { engine: 'Engine', manual: 'Written here', import: 'Imported' }
export const RUN_STATUS_LABEL: Record<string, string> = { queued: 'Queued', running: 'Running', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled' }
export const NODE_STATUS_LABEL: Record<string, string> = { queued: 'Queued', running: 'Running', completed: 'Done', failed: 'Failed', skipped: 'Skipped' }
export const TRIGGER_LABEL: Record<string, string> = { manual: 'Started here', scheduled: 'Nightly', retry: 'Retry' }
export const GSC_STATUS_LABEL: Record<string, string> = { connected: 'Connected', needs_property: 'Choose a property', error: 'Error', disconnected: 'Not connected' }
export const ACTION_KIND_LABEL: Record<string, string> = { snippet: 'Rewrite title and description', depth: 'Strengthen the page', write: 'Write an article' }
export const FOCUS_LABEL: Record<string, string> = { product: 'Product or service', case_study: 'Case study', market: 'The market itself', topic: 'A topic', question: 'A search' }
