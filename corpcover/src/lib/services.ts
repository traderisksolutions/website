// One name per service (navbar, footer) and one CTA label per service (every button).
// name pattern: [what] + [service]. cta pattern: first-person action. Change it here and it changes everywhere.
export const SERVICES = {
  review: { name: "Policy review", cta: "Send my policy for review", path: "/policy-review" },
  quotes: { name: "Cover quotes", cta: "Request quotes", path: "/get-covered" },
  chat: { name: "Adviser chat", cta: "Ask a question", path: "/ask" },
  claim: { name: "Claim review", cta: "Send my claim for review", path: "/claims" },
} as const;
export type ServiceKey = keyof typeof SERVICES;
