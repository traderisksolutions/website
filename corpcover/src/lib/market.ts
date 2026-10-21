// The three markets corpcover.com serves, each under its own subfolder (/sg, /my, /hk).
// One domain so every link builds the same authority; each market has its own law, insurers,
// currency and pages. Pure: used by server pages and client components alike.

export type MarketKey = "sg" | "my" | "hk";
export type Market = {
  key: MarketKey; code: "SG" | "MY" | "HK"; name: string; adj: string; lang: string; cc: string; currency: string;
  /** The compulsory work-injury cover, named as the market names it. */
  workInjury: string;
  /** The company registration number, as the market names it. */
  regNo: string;
  /** The personal data law named in the consent line. */
  privacyLaw: string;
  /** The free dispute body for insurance claims in the market. */
  disputeBody: string;
  /** When to file with the dispute body, if the body publishes a deadline. */
  disputeDeadline: string | null;
  /** Who the dispute body takes, its limit and its cost. Legal review 21 Oct 2026. */
  disputeNote: string;
  /** Whether the long, Chubb-Singapore questionnaire (/find) applies. */
  find: boolean;
};

export const MARKETS: Record<MarketKey, Market> = {
  sg: { key: "sg", code: "SG", name: "Singapore", adj: "Singapore", lang: "en-SG", cc: "+65", currency: "S$", workInjury: "Work injury compensation", regNo: "UEN", privacyLaw: "the Personal Data Protection Act", disputeBody: "FIDReC", disputeDeadline: "within 6 months of the insurer's final reply", disputeNote: "FIDReC takes disputes from individuals, sole proprietors, charities and small businesses with group turnover of S$1 million or less in each of the last 2 financial years. Filing and mediation are free. Adjudication costs S$50, or S$250 for a small business, and awards are capped at S$150,000.", find: true },
  my: { key: "my", code: "MY", name: "Malaysia", adj: "Malaysian", lang: "en-MY", cc: "+60", currency: "RM", workInjury: "Workers' compensation (SOCSO and foreign workers)", regNo: "SSM registration number", privacyLaw: "the Personal Data Protection Act 2010", disputeBody: "the Financial Markets Ombudsman Service (FMOS)", disputeDeadline: "within 6 months of the insurer's final decision", disputeNote: "FMOS takes disputes up to RM250,000 from individuals and micro and small businesses. It is free, and it does not hear third-party bodily injury or death claims.", find: false },
  hk: { key: "hk", code: "HK", name: "Hong Kong", adj: "Hong Kong", lang: "en-HK", cc: "+852", currency: "HK$", workInjury: "Employees' compensation", regNo: "Business Registration number", privacyLaw: "the Personal Data (Privacy) Ordinance", disputeBody: "the Insurance Complaints Bureau (ICB)", disputeDeadline: "within 6 months of the insurer's final decision", disputeNote: "The ICB takes complaints on personal policies only, up to HK$1,500,000, free of charge. Business, industrial and third-party policies are outside its scope.", find: false },
};
export const MARKET_KEYS = Object.keys(MARKETS) as MarketKey[];
export const isMarket = (v: unknown): v is MarketKey => typeof v === "string" && v in MARKETS;
export const DEFAULT_MARKET: MarketKey = "sg";

/** The market a pathname belongs to; Singapore when the path has none. */
export function marketOf(pathname: string | null | undefined): MarketKey {
  const seg = (pathname ?? "").split("/")[1];
  return isMarket(seg) ? seg : DEFAULT_MARKET;
}

/** "/about" in a market → "/sg/about". */
export const mpath = (m: MarketKey, path = "/") => `/${m}${path === "/" ? "" : path}`;

/** hreflang alternates for a page that exists in every market. */
export function alternates(m: MarketKey, path = "/") {
  return {
    canonical: mpath(m, path),
    languages: { ...Object.fromEntries(MARKET_KEYS.map(k => [MARKETS[k].lang, mpath(k, path)])), "x-default": "/" },
  };
}

/** The market from a route's params; a 404 for anything that is not sg, my or hk. */
export async function marketParam(params: Promise<{ market: string }>): Promise<MarketKey> {
  const { market } = await params;
  if (!isMarket(market)) { const { notFound } = await import("next/navigation"); notFound(); }
  return market as MarketKey;
}
