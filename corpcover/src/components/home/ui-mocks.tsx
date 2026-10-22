// Coded product views used as images on the home page. Example data only; each is marked "Example".

const Pdf = () => <svg width="9" height="11" viewBox="0 0 10 12" aria-hidden><path d="M1 1h5l3 3v7H1z" fill="#c8453b" /></svg>;

function Rail() {
  return (
    <div className="ui-rail" aria-hidden>
      <span className="ui-rail-logo">CC</span>
      {["New", "Review", "Claims", "Files"].map(l => <span key={l}><i />{l}</span>)}
    </div>
  );
}

/** Policy review table: cover, limit, what the contract asks, result. */
export function ReviewMock({ currency = "S$" }: { currency?: string }) {
  const rows: [string, string, string, string, string][] = [
    ["Public liability", `${currency}2,000,000`, "Contractual liability", `${currency}5,000,000`, "rose:Below contract"],
    ["Work injury", "Statutory", "Non-manual above cap", "Statutory", "mint:Meets"],
    ["Contractor's all risks", `${currency}850,000`, "Defective design", `${currency}1,200,000`, "sand:Under-insured"],
    ["Professional indemnity", "Not held", "–", "Tender clause 3.1", "rose:Missing"],
    ["Fire and property", `${currency}600,000`, "Flood, unless added", "–", "sky:Check average"],
    ["Goods in transit", `${currency}80,000`, "Unattended vehicle", "–", "grey:Reading"],
  ];
  return (
    <div className="ui-win">
      <Rail />
      <div className="ui-main">
        <p className="ui-kicker">Policy review <span className="ui-tag">Example</span></p>
        <p className="ui-title">Lim &amp; Tan Engineering</p>
        <div className="ui-files"><span><Pdf />Schedule_PL_2026.pdf</span><span><Pdf />Main_contract.pdf</span></div>
        <div className="ui-table" role="table" aria-label="Example policy review">
          <div className="ui-tr ui-th" role="row"><span>Cover</span><span>Limit</span><span>Main exclusion</span><span>Contract asks</span><span>Result</span></div>
          {rows.map(([c, l, x, k, r]) => {
            const [tone, label] = r.split(":");
            return <div key={c} className="ui-tr" role="row"><b>{c}</b><span>{l}</span><span>{x}</span><span>{k}</span><span><em className={`ui-chip ui-${tone}`}>{label}</em></span></div>;
          })}
        </div>
      </div>
    </div>
  );
}

/** Ask: one written thread, answer cites the clause. */
export function AskMock({ currency = "S$" }: { currency?: string }) {
  return (
    <div className="ui-win">
      <Rail />
      <div className="ui-main">
        <p className="ui-kicker">Ask <span className="ui-tag">Example</span></p>
        <p className="ui-title">Lease requirement</p>
        <div className="ui-chat">
          <p className="ui-me">Our landlord wants {currency}5M public liability. We hold {currency}2M. What do we do?</p>
          <p className="ui-us">Raise the limit to {currency}5M before the lease starts, and ask the insurer to name the landlord as an additional insured. Both are added by endorsement. <span className="ui-cite">Lease 11.2</span></p>
          <p className="ui-me">Does the premium change?</p>
          <p className="ui-us">Yes. The insurer quotes the extra premium for the rest of the period.</p>
        </div>
        <div className="ui-composer">Ask about your cover<i /></div>
      </div>
    </div>
  );
}

/** Select: business type, then the covers it usually holds. */
export function SelectMock() {
  return (
    <div className="ui-win">
      <Rail />
      <div className="ui-main">
        <p className="ui-kicker">Select <span className="ui-tag">Example</span></p>
        <p className="ui-title">Your business type</p>
        <div className="ui-input">renovation</div>
        <div className="ui-list">
          <span className="on">Renovation or interior design contractor <small>Construction</small></span>
          <span>Main contractor or builder <small>Construction</small></span>
          <span>M&amp;E or specialist subcontractor <small>Construction</small></span>
        </div>
        <p className="ui-label">Common for this type</p>
        <div className="ui-opts"><span className="on">Contractor&apos;s all risks</span><span className="on">Public liability</span><span className="on">Work injury compensation</span><span>Not sure</span></div>
      </div>
    </div>
  );
}
