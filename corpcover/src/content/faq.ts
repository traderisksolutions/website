// FAQ: five questions an owner asks before starting, in the owner's own words. Facts from
// corporatecover.sg. Each has a short answer and three points; the chat plays them.

export type Icon = "tag" | "people" | "stack" | "check" | "arrow";
export type Faq = { q: string; icon: Icon; a: string; points: string[] };

export const insurers = [
  "Aetna", "AIG", "Allianz", "Allied World", "AXA", "Berkley Insurance", "China Taiping", "Chubb", "Cigna Global",
  "EQ Insurance", "Etiqa", "Liberty", "MSIG", "NTUC Income", "QBE", "Singlife", "Sompo", "Tokio Marine",
];

export const policyGroups: { name: string; items: string[] }[] = [
  { name: "People", items: ["Work injury compensation", "Employee benefits", "Keyman insurance"] },
  { name: "Liability", items: ["Public liability", "General liability", "Professional indemnity"] },
  { name: "Property and projects", items: ["Commercial property", "Commercial fire", "Business all risks", "Contractor's all risks", "Erection all risks"] },
];

const base: Faq[] = [
  {
    q: "What does this cost my business?",
    icon: "tag",
    a: "Nothing. Corp Cover and its advisers charge no fee.",
    points: [
      "The insurer pays the adviser a commission on the policy you buy.",
      "You pay the premium the insurer quotes. There is no fee on top.",
      "A review, a quote or a call costs nothing, whether you buy or not.",
    ],
  },
  {
    q: "Who will I deal with?",
    icon: "people",
    a: "An independent adviser who arranges business insurance.",
    points: [
      "The adviser works with several insurers, not one.",
      "One adviser handles every policy your company holds.",
      "The adviser gives you their name and licence details before any recommendation.",
    ],
  },
  {
    q: "Which policies can you review?",
    icon: "stack",
    a: "Most general insurance and employee benefits a company holds.",
    points: [
      "Required by law: work injury compensation, and foreign worker medical insurance and security bonds.",
      "Required by contract: public liability in a lease, professional indemnity in client contracts.",
      "Property, directors and officers, cyber and other cover on request.",
    ],
  },
  {
    q: "Do I have to buy anything?",
    icon: "check",
    a: "No. A review is not a quote, and a quote is not a commitment.",
    points: [
      "Buy through the adviser, buy elsewhere, or keep your current cover.",
      "Nothing changes on your policy unless you instruct it.",
      "The decision stays with you.",
    ],
  },
  {
    q: "How do I start?",
    icon: "arrow",
    a: "Three ways. None of them costs anything.",
    points: [
      "Send my policy for review: upload the schedule and an adviser explains the gaps.",
      "Find my cover: answer questions on your business, then speak to an adviser.",
      "Ask a question here, or message an adviser on WhatsApp.",
    ],
  },
];

/** The FAQ for a market: the same questions, with the legally required cover named for that market. */
const REQUIRED: Record<"sg" | "my" | "hk", string> = {
  sg: "Required by law: work injury compensation, and foreign worker medical insurance and security bonds.",
  my: "Required by law: work injury cover for employees under SOCSO, and compensation cover for foreign workers.",
  hk: "Required by law: employees' compensation insurance for every employee.",
};
export function faqsFor(m: "sg" | "my" | "hk"): Faq[] {
  return base.map(f => f.q === "Which policies can you review?" ? { ...f, points: [REQUIRED[m], ...f.points.slice(1)] } : f);
}
export const faqs = faqsFor("sg");
