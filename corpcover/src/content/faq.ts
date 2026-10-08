// FAQ, from corporatecover.sg. Answers kept to their facts; marketing lines trimmed.

export type Faq = { q: string; a: (string | string[])[] };

export const insurers = [
  "Aetna", "AIG", "Allianz", "Allied World", "AXA", "Berkley Insurance", "China Taiping", "Chubb", "Cigna Global",
  "EQ Insurance", "Etiqa", "Liberty", "MSIG", "NTUC Income", "QBE", "Singlife", "Sompo", "Tokio Marine",
];

export const faqs: Faq[] = [
  {
    q: "Who are your business insurance partners?",
    a: [
      "Corp Cover works with independent financial advisers who specialise in business insurance.",
      "They broker for a wide range of insurers in Singapore, so you see options from several insurers rather than one.",
    ],
  },
  {
    q: "How did you select your business insurance partners?",
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
    a: [
      "Our partners come from several business insurance firms, which together give access to a broad set of corporate insurers.",
      "They work together across firms, so one enquiry can cover every part of your business insurance.",
    ],
  },
  {
    q: "What insurers can your partners broker for me?",
    a: [
      "Our partners broker for these 18 insurers, and add more over time:",
      insurers,
      "This covers general insurance, employee benefits and specialised cover.",
    ],
  },
  {
    q: "What types of insurance policies can your partners help me compare?",
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
    a: [
      "No. You can get quotes and compare policies through our partners and still buy elsewhere. The decision is yours.",
    ],
  },
  {
    q: "What are your fees?",
    a: ["None. Corp Cover is free to use."],
  },
  {
    q: "What are your partners' fees?",
    a: [
      "Our partners charge you no fees. They are paid a commission by the insurer that issues the policy.",
      "They cannot raise the price an insurer quotes you. They use volume pricing and negotiation to bring it down.",
    ],
  },
];
