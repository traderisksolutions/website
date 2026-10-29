// Tags on the home cover checker and cover list. Statutory tags cite the law; nothing is
// tagged "required" without one. Pure: used by server and client components.
import type { MarketKey } from "./market";

/** The one cover each market's law requires of most employers, and who it applies to. */
export const COVER_LAW: Record<MarketKey, { cover: string; note: string }> = {
  sg: { cover: "Work injury compensation", note: "Required for manual workers, and for other staff earning S$2,600 a month or less. Work Injury Compensation Act 2019." },
  my: { cover: "Work injury compensation", note: "SOCSO contributions are required for every employee, including foreign workers. Employees' Social Security Act 1969." },
  hk: { cover: "Work injury compensation", note: "Required for every employee, full or part time. Employees' Compensation Ordinance, Cap. 282." },
};

/** Covers that leases, tenders and client contracts most often name. */
export const CONTRACT_COVERS = ["Public liability", "Professional indemnity", "Contractor's all risks"];

/** Cover → guide slug, where a guide exists. The page checks the slug against the market's feed. */
export const COVER_GUIDES: Record<string, string> = {
  "Public liability": "public-liability",
  "Professional indemnity": "professional-indemnity",
  "Directors and officers": "directors-and-officers",
  "Work injury compensation": "work-injury-compensation",
  "Commercial property and fire": "property-and-business-interruption",
  "Business interruption": "property-and-business-interruption",
};

/** The hero email waits here for the policy review form. */
export const REVIEW_EMAIL_KEY = "cc-review-email";

/** Shown beside the services and the claim panel; the footer keeps its own longer line. */
export const DISCLOSURE = "Corp Cover is not an insurer, an insurance broker or a financial adviser. Quotes and cover are arranged by licensed brokers and insurers. Reports are not legal advice.";
