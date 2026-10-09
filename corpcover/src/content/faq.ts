// FAQ: five questions a company asks before sending its policy. Facts from corporatecover.sg,
// regrouped. Each question has a short answer, three points, and a panel that shows the facts.

export type Panel = "cost" | "advisers" | "policies" | "decide" | "start";
export type Icon = "tag" | "people" | "stack" | "check" | "arrow";
export type Faq = { q: string; icon: Icon; a: string; points: string[]; panel: Panel };

export const insurers = [
  "Aetna", "AIG", "Allianz", "Allied World", "AXA", "Berkley Insurance", "China Taiping", "Chubb", "Cigna Global",
  "EQ Insurance", "Etiqa", "Liberty", "MSIG", "NTUC Income", "QBE", "Singlife", "Sompo", "Tokio Marine",
];

export const policyGroups: { name: string; items: string[] }[] = [
  { name: "People", items: ["Work injury compensation", "Employee benefits", "Keyman insurance"] },
  { name: "Liability", items: ["Public liability", "General liability", "Professional indemnity"] },
  { name: "Property and projects", items: ["Commercial property", "Commercial fire", "Business all risks", "Contractor's all risks", "Erection all risks"] },
];

export const faqs: Faq[] = [
  {
    q: "What does it cost?",
    icon: "tag",
    a: "Nothing. Corp Cover and its advisers charge you no fee.",
    points: [
      "Advisers are paid a commission by the insurer that issues the policy.",
      "Commission does not raise the premium an insurer quotes you.",
      "Advisers negotiate and use volume pricing to bring the premium down.",
    ],
    panel: "cost",
  },
  {
    q: "Who will I deal with?",
    icon: "people",
    a: "An independent financial adviser who specialises in business insurance.",
    points: [
      "Advisers broker for several insurers, not one.",
      "One enquiry covers every policy your company holds.",
      "Advisers from different firms work together on the same enquiry.",
    ],
    panel: "advisers",
  },
  {
    q: "Which policies can I compare?",
    icon: "stack",
    a: "General insurance, employee benefits and specialised cover for companies.",
    points: [
      "Policies required by law, such as work injury compensation.",
      "Policies required by contract, such as public liability in a lease.",
      "Other covers on request.",
    ],
    panel: "policies",
  },
  {
    q: "Do I have to buy?",
    icon: "check",
    a: "No. There is no obligation to buy.",
    points: [
      "Get quotes and compare policies through the advisers.",
      "Buy through them, buy elsewhere, or keep your current cover.",
      "The decision is yours.",
    ],
    panel: "decide",
  },
  {
    q: "How do I start?",
    icon: "arrow",
    a: "Three ways, all free.",
    points: [
      "Upload your current policy for a review.",
      "Answer five questions to see the covers a company like yours holds.",
      "Talk to an adviser by WhatsApp, callback or phone.",
    ],
    panel: "start",
  },
];
