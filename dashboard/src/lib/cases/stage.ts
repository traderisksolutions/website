/**
 * The nine stages every quote case moves through, new request or renewal, whatever the line:
 *
 *   request → data_complete → sent_to_insurers → terms_received → comparison_sent →
 *   client_decides → bind → policy_and_dn → paid
 *
 * Records decide the stage, never the model: the placement's lines and dispatches, the document
 * register, the debit note. The case worker's reading only fills in a case no record covers yet,
 * such as a conversation forwarded to operations@ midway. `status` on the work item still says
 * whose turn it is; the stage says how far the case has got.
 *
 * Pure. Tested in src/lib/cases/__tests__/stage.test.ts.
 */

export const STAGES = ['request', 'data_complete', 'sent_to_insurers', 'terms_received', 'comparison_sent', 'client_decides', 'bind', 'policy_and_dn', 'paid'] as const
export type Stage = typeof STAGES[number]

export const STAGE_LABEL: Record<Stage, string> = {
  request: 'Request',
  data_complete: 'Data complete',
  sent_to_insurers: 'Sent to insurers',
  terms_received: 'Terms received',
  comparison_sent: 'Comparison sent',
  client_decides: 'Client decides',
  bind: 'Bind',
  policy_and_dn: 'Policy and debit note',
  paid: 'Paid',
}

/** Case types that run on the nine stages. Claims, movements and billing keep status only. */
export const STAGED_TYPES = new Set(['new_quote', 'renewal'])

export const START_POINTS = ['new_request', 'midway', 'renewal'] as const
export type StartPoint = typeof START_POINTS[number]

export const isStage = (s: unknown): s is Stage => typeof s === 'string' && (STAGES as readonly string[]).includes(s)
export const stageIndex = (s: Stage) => STAGES.indexOf(s)

export type LineFacts = {
  /** placement_lines.status */
  status: string
  /** Requests to insurers on this line that have gone out (status sent, quoted or declined). */
  dispatchesSent: number
  /** Requests drafted but not sent yet. */
  dispatchesDrafted: number
  /** Quotes or indications read into the grid for this line. */
  quotes: number
}

export type StageFacts = {
  lines: LineFacts[]
  /** The document register has nothing outstanding (or the case has no register). */
  documentsComplete: boolean
  /** A TRS debit note exists for the case's policy. */
  debitNote: boolean
  /** That debit note is settled. */
  paid: boolean
  /** work_items.status: a comparison the client has answered moves to client_decides. */
  status: string | null
  /** The stage already stored (from the start point or the case worker's reading). */
  stored: Stage | null
}

const DEAD = new Set(['declined', 'dropped', 'lost', 'closed'])

/** The stage one placement line has reached. */
export function lineStage(l: LineFacts, f: Pick<StageFacts, 'documentsComplete' | 'status'>): Stage {
  if (l.status === 'done') return 'policy_and_dn'
  if (l.status === 'bound') return 'bind'
  if (l.status === 'presented') return f.status && f.status !== 'waiting_client' ? 'client_decides' : 'comparison_sent'
  if (l.status === 'quoted' || l.quotes > 0) return 'terms_received'
  if (l.dispatchesSent > 0) return 'sent_to_insurers'
  if (l.dispatchesDrafted > 0 || (l.status === 'quoting' && f.documentsComplete)) return 'data_complete'
  return 'request'
}

/**
 * The case's stage. A case is as far as its least advanced live line: a three-line placement
 * with one line bound and two still with insurers is with insurers. Money closes the case: a
 * debit note moves it to policy_and_dn, its payment to paid. With no line on file, the stored
 * stage stands (never moved backwards by the absence of a record), defaulting to request.
 */
export function stageFromRecords(f: StageFacts): Stage {
  if (f.paid) return 'paid'
  const live = f.lines.filter(l => !DEAD.has(l.status))
  let fromLines: Stage | null = null
  if (live.length) fromLines = live.map(l => lineStage(l, f)).reduce((a, b) => (stageIndex(a) <= stageIndex(b) ? a : b))
  if (f.debitNote && (!fromLines || stageIndex(fromLines) >= stageIndex('bind'))) return 'policy_and_dn'
  if (fromLines) return fromLines
  if (f.debitNote) return 'policy_and_dn'
  return f.stored ?? 'request'
}

/** The start point of a case opened by the case worker or the placement agent. */
export function startPointFor(o: { caseType: string; openedMode?: string | null; rebuilt?: boolean }): StartPoint | null {
  if (o.caseType === 'renewal' && !o.openedMode) return 'renewal'
  if (o.openedMode === 'from_forward' || o.openedMode === 'midway' || o.rebuilt) return 'midway'
  if (o.caseType === 'new_quote' || o.caseType === 'renewal') return 'new_request'
  return null
}
