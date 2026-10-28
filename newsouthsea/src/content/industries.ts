// Industries New South Sea serves. One record per /industries/[slug] page.

export type Industry = {
  slug: string;
  name: string;
  headline: string;
  summary: string;
  /** Exposures specific to this industry, each a short title and one or two sentences. */
  exposures: { title: string; body: string; response: string }[];
  /** Lines that usually make up the programme, by slug from coverage.ts. */
  programme: string[];
  /** Questions a buyer in this industry asks, answered plainly. */
  faqs: { q: string; a: string }[];
  /** Photo in /public/images. */
  image: string;
};

export const INDUSTRIES: Industry[] = [
  {
    slug: "trading-logistics",
    image: "port",
    name: "Trading and logistics",
    headline: "Goods change hands at every port. The cover has to follow them.",
    summary: "Programmes for trading houses, freight forwarders and sourcing companies.",
    exposures: [
      { title: "Risk changing hands at every port", body: "Incoterms move liability between buyer and seller. Cargo and liability cover must match the terms actually used.", response: "Cargo cover matched to the Incoterms in use, with contingency cover where the buyer insures." },
      { title: "Stock accumulating in third-party warehouses", body: "Peak values at a single warehouse often exceed per-location limits.", response: "Per-location limits set from peak values, declared by site." },
      { title: "Products sold into the United States", body: "North American liability exposure changes the price and wording of the whole casualty programme.", response: "Liability programme priced and worded for North American exposure." },
      { title: "Buyer default on open terms", body: "Receivables are often the largest asset on the balance sheet and the least insured.", response: "Trade credit with confirmed buyer limits, assignable to the lender." },
    ],
    programme: ["marine-cargo-stock-throughput", "trade-credit", "public-products-liability", "property-business-interruption"],
    faqs: [
      { q: "Do we need cargo cover if our buyer insures?", a: "Only if the Incoterms put the risk on them for the whole journey. Contingency cover protects you if their policy does not respond." },
      { q: "Can trade credit cover support our bank facility?", a: "Yes. The policy can be assigned to the lender, and banks often improve advance rates on insured receivables." },
      { q: "How are sanctions handled?", a: "Every trade lane is checked at renewal. Routes touching sanctioned territories are flagged before binding, not after a loss." },
    ],
  },
  {
    slug: "financial-services",
    image: "bank",
    name: "Financial services",
    headline: "Regulators investigate people, not companies. The programme should be built around that.",
    summary: "Management and professional liability for asset managers, family offices, brokers and fintech firms licensed by the SFC, HKMA or IA.",
    exposures: [
      { title: "Regulatory investigations", body: "SFC and HKMA enquiries generate legal costs long before any claim is made.", response: "D&O with investigation costs cover that responds before a claim is made." },
      { title: "Claims from investors", body: "Allegations of misselling or breach of mandate fall under professional indemnity.", response: "Professional indemnity with limits set against mandates and fund documents." },
      { title: "Payment fraud and social engineering", body: "Diverted transfers are the most frequent large loss in the sector.", response: "Crime cover with a social engineering section, and controls that meet its conditions." },
      { title: "Personal liability of directors", body: "Directors of licensed entities face personal exposure that the company may not be able to indemnify.", response: "A dedicated Side A limit that the company cannot exhaust." },
    ],
    programme: ["directors-officers", "professional-indemnity", "crime-fidelity", "cyber"],
    faqs: [
      { q: "Does the SFC require professional indemnity insurance?", a: "Requirements depend on the licence type. We review your licence conditions and set limits against them and against investor contracts." },
      { q: "Should D&O and PI be combined?", a: "Combined policies cost less but share one limit. For regulated firms we usually recommend separate limits for each." },
      { q: "Are fund directors covered?", a: "Outside directorship cover can extend to fund boards, subject to the fund's own indemnity and insurance." },
    ],
  },
  {
    slug: "technology",
    image: "tech",
    name: "Technology",
    headline: "When the service fails, the client's loss becomes yours.",
    summary: "Technology errors and omissions, cyber and management liability for software, platform and IT services companies.",
    exposures: [
      { title: "Service failure", body: "Outages and defects lead to claims for the client's lost revenue, often far above contract value.", response: "Technology E&O that may respond to the client's financial loss, not only physical damage." },
      { title: "Data held for clients", body: "Breaches of client data trigger liability under the PDPO and under contract.", response: "Cyber with privacy liability and regulatory cover under the PDPO." },
      { title: "Fundraising and investor claims", body: "Each funding round adds directors' duties and investor expectations.", response: "D&O written for the next round, with run-off agreed before a sale." },
      { title: "Contracts with uncapped liability", body: "Enterprise clients push for unlimited indemnities that no policy will match.", response: "Contract review before signing, so limits and caps match." },
    ],
    programme: ["professional-indemnity", "cyber", "directors-officers", "crime-fidelity"],
    faqs: [
      { q: "Is cyber the same as tech E&O?", a: "No. Cyber responds to your own network event. Tech E&O responds when your service causes a client's loss. Most technology firms need both." },
      { q: "What limits do enterprise clients expect?", a: "It depends on the contract. We review client requirements before renewal so limits are set once, not negotiated deal by deal." },
      { q: "Does cover apply to clients in other countries?", a: "Only within the policy's territorial and jurisdiction limits. Check them before signing a client contract governed by foreign law." },
    ],
  },
  {
    slug: "construction-property",
    image: "construction",
    name: "Construction and property",
    headline: "The contract sets the risk. The site decides whether it happens.",
    summary: "Contract works, liability and employees' compensation for developers, main contractors, fit-out firms and property owners.",
    exposures: [
      { title: "Damage to the works", body: "Typhoons, fire and collapse during construction fall on whoever the contract makes responsible.", response: "Contract works cover written to the contract's insurance clauses." },
      { title: "Injury on site", body: "Principal contractors can be liable for subcontractors' workers under Cap. 282.", response: "Employees' compensation and liability that extend to subcontracted labour." },
      { title: "Damage to neighbouring property", body: "Excavation and piling near existing buildings and rail lines carry high third-party exposure.", response: "Third-party limits set from the site's surroundings, with existing structures declared." },
      { title: "Completed buildings", body: "Owners need property and liability cover that takes over the day the contractor leaves.", response: "Owner's property and liability in place on the handover date." },
    ],
    programme: ["construction-all-risks", "employees-compensation", "public-products-liability", "property-business-interruption"],
    faqs: [
      { q: "Should the owner or the contractor arrange the policy?", a: "Owner-controlled programmes give one wording and one claims process. We review the contract and recommend before tender." },
      { q: "What is covered for defects?", a: "That depends on the defects clause, usually LEG 2 or LEG 3. The choice should match the contract and the design risk." },
      { q: "Are subcontractors insured under our policy?", a: "They can be named insureds. The contract and the policy must say the same thing." },
    ],
  },
  {
    slug: "retail-hospitality",
    name: "Retail and hospitality",
    image: "restaurant",
    headline: "Every customer through the door is a liability exposure.",
    summary: "Property, liability and employees' compensation for retailers, restaurant groups and hotels.",
    exposures: [
      { title: "Customer injury", body: "Slips, falls and food-related claims from the public are the most frequent liability losses in the sector.", response: "Public liability with limits set by footfall and lease requirements." },
      { title: "Fire and water damage", body: "Kitchens and shared building services cause losses that close a site for weeks.", response: "Property and business interruption with an indemnity period sized to refit time." },
      { title: "Staff injury", body: "Kitchen and warehouse roles carry the highest Cap. 282 claim frequency.", response: "Employees' compensation priced on payroll by role, with return-to-work support." },
      { title: "Lease obligations", body: "Landlords require specific limits and named interests. The policy must match each lease.", response: "Policies that name landlords' interests and match each lease's limits." },
    ],
    programme: ["property-business-interruption", "public-products-liability", "employees-compensation", "crime-fidelity"],
    faqs: [
      { q: "Can one policy cover all our outlets?", a: "Yes. A single programme with a schedule of locations is simpler to manage and usually costs less than separate policies." },
      { q: "Are we covered if the mall closes?", a: "Only with a denial of access extension. Its trigger and limit should be checked against how your sites are accessed." },
      { q: "Does business interruption cover a typhoon closure?", a: "Only if the closure follows insured damage or the wording includes a specific extension. Most policies need one." },
    ],
  },
  {
    slug: "professional-services",
    image: "office",
    name: "Professional services",
    headline: "The advice is the product. So is the liability.",
    summary: "Professional indemnity, cyber and management liability for consultancies, engineering firms, law firms and accountants.",
    exposures: [
      { title: "Negligence claims", body: "A single claim from a large engagement can exceed annual fee income.", response: "Professional indemnity sized from the largest engagement, after contractual caps." },
      { title: "Client data and confidentiality", body: "Client files are a target for ransomware and a source of liability if released.", response: "Cyber with incident response and confidentiality liability." },
      { title: "Partners leaving", body: "Claims often arise years after the work. Departing partners need run-off protection.", response: "Run-off cover agreed for departing partners." },
      { title: "Payment fraud", body: "Client money and supplier payments are targeted by impersonation emails.", response: "Crime cover with verification conditions written into the firm's procedures." },
    ],
    programme: ["professional-indemnity", "cyber", "crime-fidelity", "directors-officers"],
    faqs: [
      { q: "What limit of indemnity should we buy?", a: "Enough for the largest realistic claim, after the liability caps in your engagement terms. We model it from your contracts." },
      { q: "Is claims-made cover a risk when we change insurer?", a: "Only if the retroactive date is lost or circumstances are not notified. We manage both at each switch." },
      { q: "Do we need cyber if IT is outsourced?", a: "Yes. Outsourcing moves the work, not the liability for your clients' data." },
    ],
  },
];

export const industryBySlug = (slug: string) => INDUSTRIES.find(i => i.slug === slug);
