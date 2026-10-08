// FAQ, from corporatecover.sg. Answers kept to their facts; marketing lines trimmed.

/** One scene of the FAQ storyboard: the question, its answer, a short chapter label and the
 *  picture shown beside it while it is on screen. */
export type Scene = "advisers" | "criteria" | "firms" | "insurers" | "policies" | "choice" | "zero" | "commission" | "referral";
export type Faq = { q: string; label: string; scene: Scene; a: (string | string[])[] };

export const insurers = [
  "Aetna", "AIG", "Allianz", "Allied World", "AXA", "Berkley Insurance", "China Taiping", "Chubb", "Cigna Global",
  "EQ Insurance", "Etiqa", "Liberty", "MSIG", "NTUC Income", "QBE", "Singlife", "Sompo", "Tokio Marine",
];

export const faqs: Faq[] = [
  {
    q: "Who are your business insurance partners?",
    label: "Our partners",
    scene: "advisers",
    a: [
      "Corporate Cover is the business insurance arm of Dollar Bureau. Our partners are independent financial advisers who specialise in business insurance.",
      "They broker for a wide range of insurers in Singapore, so you see options from several insurers rather than one. Their Google rating is 5.0.",
    ],
  },
  {
    q: "How did you select your business insurance partners?",
    label: "How we chose them",
    scene: "criteria",
    a: [
      "We spoke with companies, financial advisers and insurance agents across the industry, and selected partners on six criteria:",
      [
        "Brokering capability: access to a wide range of business insurers in Singapore.",
        "Industry experience and an established client base across sectors.",
        "Volume pricing from insurers, passed on as lower premiums.",
        "Reputation for professionalism and integrity among peers and clients.",
        "Specialised expertise and responsive service.",
        "Research and consultation with the wider industry before selection.",
      ],
    ],
  },
  {
    q: "What companies are your partners from?",
    label: "Their firms",
    scene: "firms",
    a: [
      "Our partners come from several business insurance firms, which together give access to a broad set of corporate insurers.",
      "They work together across firms, so one enquiry can cover every part of your business insurance.",
    ],
  },
  {
    q: "What insurers can your partners broker for me?",
    label: "Insurers",
    scene: "insurers",
    a: [
      "Our partners broker for the 18 insurers shown, and add more over time.",
      insurers,
      "This covers general insurance, employee benefits and specialised cover.",
    ],
  },
  {
    q: "What types of insurance policies can your partners help me compare?",
    label: "Policies",
    scene: "policies",
    a: [
      [
        "Business all risks", "Contractor's all risks", "Erection all risks", "Work injury compensation",
        "Commercial property", "Commercial fire", "Public liability", "Professional indemnity",
        "General liability", "Keyman insurance", "Employee benefits",
      ],
      "Other covers are available on request.",
    ],
  },
  {
    q: "Am I obligated to buy from your partners?",
    label: "No obligation",
    scene: "choice",
    a: [
      "No. You can get quotes and compare policies through our partners and still buy elsewhere. The decision is yours.",
    ],
  },
  {
    q: "What are your fees?",
    label: "Our fees",
    scene: "zero",
    a: ["None. Corporate Cover is a free matching service."],
  },
  {
    q: "What are your partners' fees?",
    label: "Partner fees",
    scene: "commission",
    a: [
      "Our partners charge you no fees. They are paid a commission by the insurer that issues the policy.",
      "They cannot raise the price an insurer quotes you. They use volume pricing and negotiation to bring it down.",
    ],
  },
  {
    q: "How does Corporate Cover by Dollar Bureau earn?",
    label: "How we earn",
    scene: "referral",
    a: [
      "Through referral commission. Our partners pass us a share of the commission they earn from insurers.",
      "This does not change the premium you pay.",
    ],
  },
];
