// Coded visuals for the home page. Example data only, each marked "Example". No app chrome:
// Corp Cover has no client dashboard, so each visual is the thing the client actually sees.

const Pdf = ({ c = "#c8453b" }: { c?: string }) => <svg width="11" height="13" viewBox="0 0 10 12" aria-hidden><path d="M1 1h5l3 3v7H1z" fill={c} /></svg>;

/** The PDF report a policy review produces: one page, cover by cover. */
export function ReportMock({ currency = "S$" }: { currency?: string }) {
  const rows: [string, string, string, string][] = [
    ["Public liability", `${currency}2,000,000`, `Lease asks ${currency}5,000,000`, "rose:Below contract"],
    ["Work injury compensation", "Statutory", "Statutory", "mint:Meets"],
    ["Contractor's all risks", `${currency}850,000`, `Contract sum ${currency}1,200,000`, "sand:Under-insured"],
    ["Professional indemnity", "Not held", "Tender clause 3.1", "rose:Missing"],
    ["Fire and property", `${currency}600,000`, "–", "sky:Check average"],
  ];
  return (
    <div className="rp-page">
      <div className="rp-head"><span>Corp Cover</span><span className="ui-tag">Example</span></div>
      <p className="rp-kicker">Policy review report · 22 Oct 2026</p>
      <p className="rp-title">GreenPoint Pte Ltd</p>
      <div className="rp-sum">
        <span><b>5</b>covers read</span><span><b>3</b>gaps against contracts</span><span><b>12</b>clauses cited</span>
      </div>
      <div className="ui-table" role="table" aria-label="Example policy review">
        <div className="ui-tr ui-th rp-tr" role="row"><span>Cover</span><span>Limit</span><span>Contract asks</span><span>Result</span></div>
        {rows.map(([c, l, k, r]) => {
          const [tone, label] = r.split(":");
          return <div key={c} className="ui-tr rp-tr" role="row"><b>{c}</b><span>{l}</span><span>{k}</span><span><em className={`ui-chip ui-${tone}`}>{label}</em></span></div>;
        })}
      </div>
      <p className="rp-foot">Each result cites the clause in your schedule or wording. Page 1 of 4.</p>
    </div>
  );
}

/** Ask: a written thread between the business and the AI, with the clause cited. */
export function ChatMock({ currency = "S$" }: { currency?: string }) {
  return (
    <div className="cm">
      <p className="cm-who">You</p>
      <p className="cm-me">Our landlord wants {currency}5M public liability. We hold {currency}2M. What do we do?</p>
      <p className="cm-who cm-ai"><i aria-hidden />Corp Cover AI</p>
      <p className="cm-ai-msg">Raise the limit to {currency}5M before the lease starts, and ask the insurer to name the landlord as an additional insured. Both are added by endorsement. <span className="ui-cite">Lease 11.2</span></p>
      <p className="cm-who">You</p>
      <p className="cm-me">Does the premium change?</p>
      <p className="cm-who cm-ai"><i aria-hidden />Corp Cover AI</p>
      <p className="cm-ai-msg">Yes. The insurer quotes the extra premium for the rest of the period. An adviser can request it today.</p>
      <div className="ui-composer">Ask about your cover<i /></div>
    </div>
  );
}

/** Review: the upload screen for a policy. */
export function UploadMock() {
  const files: [string, string, number, string][] = [
    ["Schedule_PL_2026.pdf", "1.2 MB", 100, "#c8453b"],
    ["Policy_wording.pdf", "3.8 MB", 100, "#c8453b"],
    ["Main_contract.pdf", "2.1 MB", 64, "#c8453b"],
    ["Lease_agreement.docx", "640 KB", 0, "#2f5fa8"],
  ];
  return (
    <div className="up">
      <p className="up-title">Send your policy</p>
      <div className="up-drop">
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden><path d="M12 16V4m0 0-4 4m4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span>Drop the schedule, wording and contracts</span>
        <small>PDF, Word or photos · up to 25 MB each</small>
      </div>
      <ul className="up-list">
        {files.map(([n, size, pct, c]) => (
          <li key={n}>
            <Pdf c={c} />
            <span className="up-name">{n}<small>{size}</small></span>
            <span className="up-state">{pct === 100 ? "Uploaded" : pct === 0 ? "Waiting" : `${pct}%`}</span>
            <span className="up-bar"><i style={{ width: `${pct}%` }} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Choose: the list of business cover, grouped. */
export function CoverListMock() {
  const groups: [string, [string, string][]][] = [
    ["Liability", [["Public liability", "Required by most leases"], ["Professional indemnity", "Consultants, tenders"], ["Directors and officers", "Board decisions"], ["Cyber liability", "Data and ransomware"]]],
    ["Assets", [["Fire and property", "Premises and stock"], ["Business interruption", "Lost profit after damage"], ["Contractor's all risks", "Works in progress"]]],
    ["Required by law", [["Work injury compensation", "Employees"]]],
  ];
  return (
    <div className="cl">
      {groups.map(([g, items]) => (
        <div key={g} className="cl-group">
          <p className="cl-label">{g}</p>
          {items.map(([n, d], i) => (
            <div key={n} className={`cl-row${g === "Liability" && i === 0 ? " on" : ""}`}>
              <span className="cl-box" aria-hidden />
              <span><b>{n}</b><small>{d}</small></span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Claim second opinion: page 1 of the PDF report the client receives. */
export function ClaimReportMock({ currency = "S$", body = "FIDReC" }: { currency?: string; body?: string }) {
  const rows: [string, string, string, string][] = [
    ["No damage at the insured premises", "Extension 4.6 Suppliers' premises", "Damage at a Singapore supplier is deemed Damage at the Premises.", "rose:Not supported"],
    ["Notice given 21 days after the event", "Condition 5.3 Claims notification", "Notice “as soon as reasonably practicable”. No fixed number of days.", "sand:Unclear"],
    ["Sum insured below gross profit", "Condition 5.7 Average", "Payment reduced in proportion. Not a ground to refuse.", "mint:Supported in part"],
  ];
  return (
    <div className="cr">
      <div className="rp-head"><span>Corp Cover</span><span className="ui-tag">Example</span></div>
      <p className="rp-kicker">Claim second opinion · Business interruption · 22 Oct 2026</p>
      <p className="rp-title">GreenPoint Pte Ltd</p>
      <div className="cr-facts">
        <span><small>Claimed</small>{currency}186,000</span><span><small>Paid</small>{currency}0</span><span><small>Insurer decision</small>Rejected</span>
      </div>
      <div className="rp-sum">
        <span><b>1</b>not supported</span><span><b>1</b>unclear</span><span><b>1</b>supported in part</span>
      </div>
      <p className="cr-h">Each reason the insurer gave</p>
      <ol className="cr-list">
        {rows.map(([reason, clause, quote, r], i) => {
          const [tone, label] = r.split(":");
          return (
            <li key={reason}>
              <span className="cr-top"><b>{i + 1}. {reason}</b><em className={`ui-chip ui-${tone}`}>{label}</em></span>
              <span className="cr-clause">{clause}</span>
              <q>{quote}</q>
            </li>
          );
        })}
      </ol>
      <p className="cr-next">Next step: write to the insurer within 14 days quoting Extension 4.6. If the final reply stands, file with {body} within 6 months.</p>
    </div>
  );
}
