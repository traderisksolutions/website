// Lines of business New South Sea places. Focus market is Hong Kong; copy stays market-neutral. One record per /coverage/[slug] page.
// Copy register: written for a reader who buys insurance for a living (CFO, risk manager, GC).

export type Line = {
  slug: string;
  name: string;
  family: Family;
  /** One line under the title. States the point an underwriter would make. */
  thesis: string;
  summary: string;
  /** What the cover is there to answer. Three points. */
  scope: string[];
  /** Facts that move price, terms or appetite. */
  factors: string[];
  /** What we ask the client for before going to market. */
  file: string[];
  /** Three mistakes we see at renewal. */
  pitfalls: { title: string; body: string }[];
  related: string[];
  /** Photo in /public/images. */
  image: string;
};

export const FAMILIES = ["Property and construction", "Casualty", "Financial lines", "Marine and trade"] as const;
export type Family = (typeof FAMILIES)[number];

export const LINES: Line[] = [
  {
    slug: "property-business-interruption",
    image: "industrial",
    name: "Property and business interruption",
    family: "Property and construction",
    thesis: "The sum insured is a number you choose. The indemnity period is a decision you make.",
    summary: "Material damage and loss of gross profit for offices, warehouses, shops and stock.",
    scope: [
      "Physical loss or damage to buildings, contents, plant and stock at declared locations.",
      "Loss of gross profit and increased cost of working while the business recovers.",
      "Extensions for suppliers, customers, denial of access and utility failure.",
    ],
    factors: [
      "Typhoon, flood and landslip exposure by site, including basement stock.",
      "Construction, sprinklers and fire separation at the main locations.",
      "Accuracy of declared values against reinstatement cost.",
      "Dependency on a single site, supplier or customer.",
    ],
    file: [
      "Schedule of values by location, with basis of valuation.",
      "Gross profit calculation from the latest audited accounts.",
      "Five years of loss history, with open reserves.",
      "Recent survey reports and the status of each recommendation.",
    ],
    pitfalls: [
      { title: "Indemnity period set by habit", body: "Twelve months is the default, not the answer. Rebuilding a fitted factory or requalifying with a customer often takes longer." },
      { title: "Average applied at claim", body: "Values declared below reinstatement cost reduce every claim, not only the large ones." },
      { title: "Supplier extensions with no named suppliers", body: "Unnamed supplier cover is usually sublimited. Key suppliers should be named." },
    ],
    related: ["construction-all-risks", "marine-cargo-stock-throughput", "trade-credit"],
  },
  {
    slug: "construction-all-risks",
    image: "construction",
    name: "Construction all risks",
    family: "Property and construction",
    thesis: "The contract decides who insures the works. Read it before the market does.",
    summary: "Contract works, plant and third-party liability for developers, main contractors and fit-out firms.",
    scope: [
      "Physical loss or damage to the works during construction and the maintenance period.",
      "Third-party injury and property damage arising from the works.",
      "Optional cover for existing structures, surrounding property and delay in start-up.",
    ],
    factors: [
      "Contract value, programme and the method of construction.",
      "Site conditions: slopes, excavation depth, adjacent buildings and MTR protection zones.",
      "Contractor's record and the quality of the site safety plan.",
      "Defects wording: LEG 2 or LEG 3, and how the client's contract allocates it.",
    ],
    file: [
      "Contract summary with the insurance clauses marked.",
      "Programme, method statement and site investigation report.",
      "Contractor and subcontractor list with claims history.",
      "Values for contract works, principal's materials and plant.",
    ],
    pitfalls: [
      { title: "Two policies covering the same works", body: "Principal-arranged and contractor-arranged cover overlap more often than they should. One programme, one wording." },
      { title: "Existing structures left out", body: "Damage to the building being altered is excluded unless declared. Fit-out projects are most exposed." },
      { title: "Maintenance period shorter than the contract", body: "The policy must run to the end of the defects liability period in the contract." },
    ],
    related: ["property-business-interruption", "public-products-liability", "employees-compensation"],
  },
  {
    slug: "public-products-liability",
    image: "street",
    name: "Public and products liability",
    family: "Casualty",
    thesis: "Limits are bought for the worst claim, not the average one.",
    summary: "Third-party injury and property damage from premises, operations and products.",
    scope: [
      "Legal liability for injury to third parties and damage to their property.",
      "Products supplied, including those made by contract manufacturers under the client's name.",
      "Defence costs, which in some jurisdictions exceed the damages.",
    ],
    factors: [
      "Turnover by activity, with any products exported to the United States or Canada.",
      "Product type, intended use and who controls design and quality.",
      "Contractual liability taken on in customer and landlord agreements.",
      "Recall procedures and traceability.",
    ],
    file: [
      "Turnover split by product line and territory.",
      "Key customer and distributor contracts, with indemnity clauses marked.",
      "Quality certifications and the latest audit results.",
      "Claims and incident history for five years.",
    ],
    pitfalls: [
      { title: "US exposure declared as 'worldwide'", body: "North American sales change the price and the wording. Undeclared, they put the whole programme at risk." },
      { title: "Recall assumed to be included", body: "Product liability pays for injury. The cost of pulling product back is a separate policy." },
      { title: "Contracts signed beyond the policy", body: "Indemnities and limits promised to customers must match what the policy will pay." },
    ],
    related: ["employees-compensation", "marine-cargo-stock-throughput", "construction-all-risks"],
  },
  {
    slug: "employees-compensation",
    image: "workers",
    name: "Employees' compensation",
    family: "Casualty",
    thesis: "Compulsory does not mean standard.",
    summary: "Cover required under the Employees' Compensation Ordinance (Cap. 282), with common law liability.",
    scope: [
      "Statutory compensation for injury or death arising out of and in the course of employment.",
      "Common law damages where the employer is found negligent.",
      "Employees on business travel abroad.",
    ],
    factors: [
      "Payroll by occupation class, separating office, site and manual work.",
      "Use of subcontractors and labour supplied through agencies.",
      "Injury frequency and return-to-work arrangements.",
      "Staff working at height, on vessels or with heavy machinery.",
    ],
    file: [
      "Payroll by job category for the current and prior year.",
      "Headcount by location and role.",
      "Five years of claims with current reserves.",
      "Safety management certifications and incident logs.",
    ],
    pitfalls: [
      { title: "Payroll declared at last year's figure", body: "Premium is adjusted on actual payroll. Underdeclaring defers the cost and invites a dispute." },
      { title: "Subcontractor staff assumed to be someone else's", body: "Under Cap. 282 a principal contractor can be liable for a subcontractor's workers." },
      { title: "Staff on business travel", body: "Injuries abroad can still fall under Cap. 282. The territorial wording must reach employees while travelling." },
    ],
    related: ["public-products-liability", "construction-all-risks", "property-business-interruption"],
  },
  {
    slug: "directors-officers",
    image: "boardroom",
    name: "Directors' and officers' liability",
    family: "Financial lines",
    thesis: "The policy belongs to the company. The protection belongs to the people.",
    summary: "Personal liability of directors and officers, company reimbursement and securities claims for listed and private companies.",
    scope: [
      "Claims against directors and officers for wrongful acts in their role.",
      "Reimbursement of the company where it indemnifies its directors.",
      "Investigation costs from the SFC, ICAC and other regulators.",
    ],
    factors: [
      "Listing status, market capitalisation and share price history.",
      "Financial strength, debt covenants and any going-concern note.",
      "Merger, acquisition or capital-raising activity in the next 12 months.",
      "Operations or listings in the United States.",
    ],
    file: [
      "Latest audited accounts and interim results.",
      "Group structure, with any US subsidiaries or ADRs.",
      "Details of pending litigation and regulatory enquiries.",
      "Current wording, limits and retentions.",
    ],
    pitfalls: [
      { title: "Shared limit, no Side A", body: "When the company is insolvent, directors compete with it for the same limit. A dedicated Side A layer protects them." },
      { title: "Insured-versus-insured excluded in full", body: "Claims by liquidators and minority shareholders should be carved back." },
      { title: "Run-off not arranged at a change of control", body: "A sale or delisting ends the policy. Six years of run-off should be agreed before closing." },
    ],
    related: ["professional-indemnity", "crime-fidelity", "cyber"],
  },
  {
    slug: "professional-indemnity",
    image: "office",
    name: "Professional indemnity",
    family: "Financial lines",
    thesis: "Cover responds to the claim, not the mistake. The retroactive date decides the rest.",
    summary: "Liability for negligent advice, design or service for consultants, asset managers, technology firms and engineers.",
    scope: [
      "Claims alleging breach of professional duty, negligence or error in services.",
      "Defence costs and settlements, including civil fines where insurable.",
      "Loss of documents and unintentional breach of confidentiality.",
    ],
    factors: [
      "Fee income split by service line and client type.",
      "Largest contracts and the liability caps negotiated in them.",
      "Quality controls: peer review, sign-off and engagement terms.",
      "Notified circumstances that may become claims.",
    ],
    file: [
      "Fee income by service line for three years.",
      "Standard terms of engagement and the five largest contracts.",
      "A completed proposal form, signed by a principal.",
      "Notifications and claims for ten years.",
    ],
    pitfalls: [
      { title: "Circumstances not notified at renewal", body: "A known issue not reported to the expiring insurer may be excluded by the new one." },
      { title: "Unlimited liability in client contracts", body: "Policy limits do not stretch to match. Caps belong in the engagement terms." },
      { title: "Retroactive date lost on a switch", body: "Changing insurer must keep prior acts cover. A fresh retroactive date leaves past work uninsured." },
    ],
    related: ["directors-officers", "cyber", "crime-fidelity"],
  },
  {
    slug: "cyber",
    image: "night",
    name: "Cyber",
    family: "Financial lines",
    thesis: "Underwriters price the controls. The questionnaire is the submission.",
    summary: "First-party loss from network events and third-party liability for data and privacy failures, including duties under the PDPO.",
    scope: [
      "Incident response: forensics, legal advice, notification and crisis communications.",
      "Business interruption and data restoration after a network event.",
      "Liability and regulatory costs following a data or privacy breach.",
    ],
    factors: [
      "Multi-factor authentication on email, remote access and privileged accounts.",
      "Offline, tested backups and the time to restore critical systems.",
      "Endpoint detection, patching cadence and end-of-life systems.",
      "Records held: personal data, payment data and volumes.",
    ],
    file: [
      "Completed cyber questionnaire, reviewed by IT before submission.",
      "Network diagram or summary of key systems and providers.",
      "Incident history and how each was resolved.",
      "Revenue dependency on online systems.",
    ],
    pitfalls: [
      { title: "Questionnaire answered by finance", body: "Answers that overstate controls give the insurer grounds to decline a claim. IT should answer the technical questions." },
      { title: "Social engineering assumed covered", body: "Payment diversion fraud is often sublimited or sits under the crime policy instead." },
      { title: "Waiting period longer than the outage", body: "A 12-hour waiting period on business interruption can remove most real losses." },
    ],
    related: ["crime-fidelity", "professional-indemnity", "directors-officers"],
  },
  {
    slug: "crime-fidelity",
    image: "bank",
    name: "Crime and fidelity",
    family: "Financial lines",
    thesis: "Most losses come from inside the company or from an email that looks like it did.",
    summary: "Employee dishonesty, third-party fraud and payment diversion for companies handling significant funds.",
    scope: [
      "Theft of money, securities or property by employees.",
      "Computer and funds transfer fraud by third parties.",
      "Social engineering losses where a payment is diverted by deception.",
    ],
    factors: [
      "Segregation of duties in payments and supplier set-up.",
      "Call-back verification for changes to bank details.",
      "Volume and value of outgoing payments.",
      "Audit findings on internal controls.",
    ],
    file: [
      "Payment approval matrix and authority limits.",
      "Description of supplier onboarding and bank detail changes.",
      "Latest internal audit report.",
      "Loss history, including frauds not claimed.",
    ],
    pitfalls: [
      { title: "Discovery and loss periods mismatched", body: "Fraud surfaces late. The policy trigger should match how long schemes take to find." },
      { title: "Verification conditions not followed", body: "Social engineering cover often requires a documented call-back. Without it, the claim fails." },
      { title: "Cyber and crime both silent", body: "Payment fraud falls between the two policies unless one is written to take it." },
    ],
    related: ["cyber", "directors-officers", "professional-indemnity"],
  },
  {
    slug: "marine-cargo-stock-throughput",
    image: "port",
    name: "Marine cargo and stock throughput",
    family: "Marine and trade",
    thesis: "Goods are most at risk where the paperwork changes hands.",
    summary: "Goods in transit by sea, air and road, and stock held in warehouses.",
    scope: [
      "Physical loss or damage to goods in transit, on Institute Cargo Clauses.",
      "Stock at warehouses and processors between voyages.",
      "General average and salvage contributions.",
    ],
    factors: [
      "Annual shipment values by route, commodity and mode.",
      "Incoterms used, which set where risk passes to the buyer.",
      "Packing, temperature control and theft-prone commodities.",
      "Maximum value at any one location or vessel.",
    ],
    file: [
      "Shipment declarations or annual values by trade lane.",
      "Standard Incoterms with major buyers and suppliers.",
      "Warehouse locations and peak values held.",
      "Claims history with surveyor reports.",
    ],
    pitfalls: [
      { title: "Incoterms not matched to cover", body: "Selling CIF means insuring for the buyer. Buying FOB means the risk starts at the port of loading." },
      { title: "Accumulation at one warehouse", body: "Peak stock at a single location often exceeds the per-location limit." },
      { title: "Sanctions clauses unread", body: "Routes touching sanctioned territories can void cover. Trade lanes should be checked each year." },
    ],
    related: ["trade-credit", "property-business-interruption", "public-products-liability"],
  },
  {
    slug: "trade-credit",
    image: "harbour",
    name: "Trade credit",
    family: "Marine and trade",
    thesis: "The policy is only as good as the credit limits behind it.",
    summary: "Protection against buyer insolvency and protracted default, used to secure receivables financing.",
    scope: [
      "Non-payment by buyers due to insolvency or protracted default.",
      "Domestic and overseas buyers, where selected.",
      "Support for receivables finance by assigning the policy to a bank.",
    ],
    factors: [
      "Debtor book: concentration, territories and payment terms.",
      "Bad debt history and collection procedures.",
      "Financial information available on key buyers.",
      "Whether the bank requires the policy for financing.",
    ],
    file: [
      "Aged debtor list with the top 20 buyers.",
      "Bad debt history for five years.",
      "Credit management procedure.",
      "Facility terms if the policy supports a loan.",
    ],
    pitfalls: [
      { title: "Limits assumed, not confirmed", body: "Cover applies only up to the limit the insurer approves for each buyer." },
      { title: "Overdue reporting missed", body: "Late notification of overdue accounts can reduce or remove a claim." },
      { title: "Policy terms not aligned with the bank", body: "Loss payee and assignment wording must satisfy the lender before drawdown." },
    ],
    related: ["marine-cargo-stock-throughput", "property-business-interruption", "directors-officers"],
  },
];

export const lineBySlug = (slug: string) => LINES.find(l => l.slug === slug);
