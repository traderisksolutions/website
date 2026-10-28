import type { Stage } from "@/components/stage-timeline";

// The placement cycle, used on /how-we-work and summarised on the home page.
export const PLACEMENT: Stage[] = [
  {
    title: "Review", headline: "Start with the exposures, not last year's schedule.",
    body: "We read the current policies against how the business actually operates today: sites, contracts, payroll, revenue by territory and the claims that have been paid.",
    points: ["Wording review against your contracts", "Gaps, overlaps and unnecessary cover listed", "Limits tested against realistic loss scenarios"],
    photo: "documents",
  },
  {
    title: "Prepare", headline: "The underwriting file is the submission.",
    body: "Underwriters price what they can see. We build one file per line with the facts that move price and terms, presented before the market asks for them.",
    points: ["Schedules of values and payroll checked", "Five-year loss history with commentary", "Risk improvements documented"],
    photo: "office",
  },
  {
    title: "Market", headline: "Selected markets, not a circulated list.",
    body: "Each risk goes to the insurers with genuine appetite for it. Fewer, better approaches return firmer terms.",
    points: ["Insurers authorised by the Insurance Authority", "Markets chosen for the line and the risk", "Terms compared line by line, not on premium alone"],
    photo: "bank",
  },
  {
    title: "Bind", headline: "The policy is checked against the quote.",
    body: "Before cover incepts we confirm the wording, subjectivities and endorsements match what was agreed. Discrepancies are fixed before they matter.",
    points: ["Subjectivities tracked to closure", "Policy wording checked clause by clause", "Certificates and evidence of cover issued"],
    photo: "boardroom",
  },
  {
    title: "Claims", headline: "A named claims contact from the first notice.",
    body: "We notify, prepare the claim and negotiate with the adjuster and the insurer. The broker who placed the risk stays involved until settlement.",
    points: ["Notification within the policy's time limits", "Claim presented with supporting evidence", "Settlement negotiated, not simply relayed"],
    photo: "industrial",
  },
];
