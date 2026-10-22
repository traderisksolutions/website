// One name per service, used in the navbar, hero, cards, page headings and footer.
// Pattern: [what] + [service]. Change a name here and it changes everywhere.
export const SERVICES = {
  review: { name: "Policy review", path: "/policy-review" },
  quotes: { name: "Cover quotes", path: "/get-covered" },
  chat: { name: "Adviser chat", path: "/ask" },
  claim: { name: "Claim review", path: "/claims" },
} as const;
export type ServiceKey = keyof typeof SERVICES;
