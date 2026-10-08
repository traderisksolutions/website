// Guides shown on the home page feed and at /articles/[slug].
// Order here is publication order, newest first. Add a guide by adding an entry.

export type Topic = "Required by law" | "Liability" | "Property" | "Directors";

export type Block =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] };

export type Article = {
  slug: string;
  title: string;
  dek: string;
  topic: Topic;
  published: string; // YYYY-MM-DD
  minutes: number;
  /** Cover tile colour, one of the --tile-* tokens. */
  tile: "sand" | "sage" | "sky" | "blush";
  /** Cover illustration and the title as set on the cover, one string per line. */
  art: "hardhat" | "pass" | "umbrella" | "document" | "gavel" | "building";
  cover: string[];
  body: Block[];
};

export const topics: Topic[] = ["Required by law", "Liability", "Property", "Directors"];

export const articles: Article[] = [
  {
    slug: "work-injury-compensation",
    title: "Work injury compensation: who must be insured",
    dek: "The one policy most Singapore employers are required to hold, and the staff it must cover.",
    topic: "Required by law",
    published: "2026-10-08",
    minutes: 4,
    tile: "sand",
    art: "hardhat",
    cover: ["Work injury", "compensation"],
    body: [
      { type: "p", text: "The Work Injury Compensation Act (WICA) requires employers to insure their liability for work injuries. It is the one business policy most Singapore employers must hold by law." },
      { type: "h2", text: "Who must be covered?" },
      { type: "ul", items: [
        "Every employee doing manual work, whatever their salary.",
        "Every employee doing non-manual work who earns S$2,600 or less a month, excluding overtime, bonuses and allowances.",
      ] },
      { type: "p", text: "Non-manual staff above that salary do not have to be insured, but the employer is still liable to pay compensation if they are injured at work. Most employers insure all staff for that reason." },
      { type: "h2", text: "What does the policy pay?" },
      { type: "ul", items: [
        "Medical expenses, up to the limit set under the Act.",
        "Wages during medical leave or light duties.",
        "Lump-sum compensation for permanent incapacity or death, calculated by formula.",
      ] },
      { type: "p", text: "Compensation is paid regardless of who was at fault. An injured employee chooses between a WICA claim and a civil claim in court; they cannot pursue both. A civil claim is answered by an employer's liability section, which most WICA policies include." },
      { type: "h2", text: "What to check on renewal" },
      { type: "ul", items: [
        "Headcount and wage roll by occupation match the current payroll.",
        "Every site and every type of work is declared, including work overseas.",
        "Contractors and freelancers are not on the policy. They need their own cover.",
      ] },
    ],
  },
  {
    slug: "foreign-worker-insurance",
    title: "Insurance for Work Permit and S Pass holders",
    dek: "Medical insurance and security bonds the Ministry of Manpower requires before a pass is issued.",
    topic: "Required by law",
    published: "2026-10-08",
    minutes: 3,
    tile: "sky",
    art: "pass",
    cover: ["Work Permit", "& S Pass", "insurance"],
    body: [
      { type: "p", text: "Employers of Work Permit and S Pass holders carry insurance obligations on top of work injury compensation. These are conditions of the pass." },
      { type: "h2", text: "Medical insurance" },
      { type: "p", text: "The employer must buy medical insurance for each Work Permit and S Pass holder. Since 1 July 2023 the minimum annual cover is S$60,000 for inpatient care and day surgery. The employer pays the premium and cannot recover it from the worker." },
      { type: "h2", text: "Security bond" },
      { type: "p", text: "Each non-Malaysian Work Permit holder needs a S$5,000 security bond. It can be lodged as a banker's guarantee or as an insurance guarantee. An insurance guarantee costs a one-off premium instead of tying up cash." },
      { type: "h2", text: "What to check" },
      { type: "ul", items: [
        "Every pass holder is named on the medical policy from their start date.",
        "The bond is in place before the Work Permit is issued.",
        "Cover is cancelled, and the bond discharged, when a pass is cancelled.",
      ] },
    ],
  },
  {
    slug: "public-liability",
    title: "Public liability and the limits in your lease",
    dek: "Why landlords and main contractors ask for it, and how to read the clause that sets the limit.",
    topic: "Liability",
    published: "2026-10-08",
    minutes: 4,
    tile: "sage",
    art: "umbrella",
    cover: ["Public", "liability"],
    body: [
      { type: "p", text: "Public liability insurance pays claims from third parties for bodily injury or property damage caused by your premises or your work. It is not required by law. It is usually required by contract." },
      { type: "h2", text: "Where the requirement comes from" },
      { type: "ul", items: [
        "Leases: landlords set a minimum limit and often ask to be named on the policy.",
        "Main contracts: contractors pass the same requirement down to subcontractors.",
        "Event venues and shopping malls: a certificate is usually needed before move-in.",
      ] },
      { type: "h2", text: "What it does not cover" },
      { type: "ul", items: [
        "Injury to your own employees. That is work injury compensation and employer's liability.",
        "Faulty advice or professional services. That is professional indemnity.",
        "Damage to property you own. That is a property policy.",
      ] },
      { type: "h2", text: "What to check" },
      { type: "p", text: "Read the insurance clause in each lease and contract. Note the minimum limit per occurrence, whether the counterparty must be named as an additional insured, and whether a waiver of subrogation is required. The policy must meet the highest requirement among them." },
    ],
  },
  {
    slug: "professional-indemnity",
    title: "Professional indemnity: claims-made cover explained",
    dek: "The policy for firms that give advice or design, and the dates that decide whether a claim is paid.",
    topic: "Liability",
    published: "2026-10-08",
    minutes: 5,
    tile: "blush",
    art: "document",
    cover: ["Professional", "indemnity"],
    body: [
      { type: "p", text: "Professional indemnity (PI) insurance pays claims that your advice, design or service caused a client a financial loss. It covers defence costs as well as damages." },
      { type: "h2", text: "Claims-made, not occurrence" },
      { type: "p", text: "Most PI policies respond to claims made while the policy is in force, not to work done while it was in force. A claim made today about work from three years ago falls on today's policy." },
      { type: "h2", text: "The retroactive date" },
      { type: "p", text: "The policy only covers work done after its retroactive date. Keep the same retroactive date when changing insurer. A new date leaves earlier work uninsured." },
      { type: "h2", text: "Run-off cover" },
      { type: "p", text: "Claims can arrive years after a firm stops trading or a project ends. Run-off cover keeps the protection in place after the business closes or is sold." },
      { type: "h2", text: "What to check" },
      { type: "ul", items: [
        "The limit meets what client contracts and any professional body require.",
        "The description of business matches every service you sell.",
        "Known circumstances are notified before renewal, not after.",
      ] },
    ],
  },
  {
    slug: "directors-and-officers",
    title: "Directors and officers liability",
    dek: "Personal cover for the people who run the company, and the three sections of a D&O policy.",
    topic: "Directors",
    published: "2026-10-08",
    minutes: 4,
    tile: "sand",
    art: "gavel",
    cover: ["Directors", "& officers"],
    body: [
      { type: "p", text: "Directors can be sued personally for decisions made on the company's behalf: by shareholders, creditors, regulators or employees. Directors and officers (D&O) insurance pays their defence costs and settlements." },
      { type: "h2", text: "The three sections" },
      { type: "ul", items: [
        "Side A pays the director directly when the company cannot indemnify them, for example in insolvency.",
        "Side B reimburses the company when it indemnifies the director.",
        "Side C covers the company itself, usually for securities claims in listed companies.",
      ] },
      { type: "h2", text: "When the policy matters most" },
      { type: "ul", items: [
        "Fundraising, when investors rely on what directors told them.",
        "Insolvency, when creditors and liquidators look for someone to pursue.",
        "Regulatory investigations, where defence costs arrive before any finding.",
      ] },
      { type: "h2", text: "What to check" },
      { type: "p", text: "Confirm that past directors are covered, that investigation costs are included, and that the limit is not shared with other policies. D&O is written on a claims-made basis, so continuity matters as it does for professional indemnity." },
    ],
  },
  {
    slug: "property-and-business-interruption",
    title: "Property and business interruption",
    dek: "Insuring premises, stock and equipment, and the income lost while they are repaired.",
    topic: "Property",
    published: "2026-10-08",
    minutes: 5,
    tile: "sage",
    art: "building",
    cover: ["Property &", "business", "interruption"],
    body: [
      { type: "p", text: "A property policy pays to repair or replace the buildings, fit-out, machinery and stock you own or are responsible for. Business interruption pays the profit lost while the business cannot trade normally after that damage." },
      { type: "h2", text: "Fire policy or all risks" },
      { type: "p", text: "A fire policy covers the perils it lists. An industrial all risks policy covers any sudden physical damage except what it excludes. All risks costs more and responds to more." },
      { type: "h2", text: "Sum insured and average" },
      { type: "p", text: "Insure on reinstatement value: the cost to rebuild or replace new today. If the sum insured is below that value, most policies apply average. Underinsured by 40%, the policy pays 60% of every claim, including small ones." },
      { type: "h2", text: "Business interruption" },
      { type: "ul", items: [
        "Gross profit is defined in the policy and is not the figure on your accounts.",
        "The indemnity period should cover the time to rebuild, refit and win customers back. Twelve months is often too short.",
        "A claim is only paid if the property damage that caused it is itself insured.",
      ] },
      { type: "h2", text: "What to check" },
      { type: "p", text: "Check the fit-out obligations in the lease. Many leases make the tenant responsible for insuring fit-out and plate glass while the landlord insures the building." },
    ],
  },
];

export const bySlug = (slug: string) => articles.find(a => a.slug === slug);

export const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
