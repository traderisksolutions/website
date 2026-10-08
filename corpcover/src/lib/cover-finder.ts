// Cover finder: five answers in, the policies a company like that usually needs out.
// Rules only — no scoring, no AI. Each result says why it is on the list.

export type Answers = {
  sector?: "professional" | "construction" | "fnb-retail" | "logistics" | "manufacturing" | "other";
  staff?: "none" | "1-10" | "11-50" | "51+";
  passHolders?: "yes" | "no";
  premises?: "rent" | "own" | "none";
  contracts?: "yes" | "no" | "unsure";
  /** What the business does, in the visitor's words, when sector is "other". */
  sectorOther?: string;
};

export type Question = { key: keyof Answers; text: string; options: { value: string; label: string }[] };

export const questions: Question[] = [
  { key: "sector", text: "What does your business do?", options: [
    { value: "professional", label: "Professional services or IT" },
    { value: "construction", label: "Construction or engineering" },
    { value: "fnb-retail", label: "F&B or retail" },
    { value: "logistics", label: "Logistics or trading" },
    { value: "manufacturing", label: "Manufacturing" },
    { value: "other", label: "Others" },
  ] },
  { key: "staff", text: "How many employees, not counting directors?", options: [
    { value: "none", label: "None" }, { value: "1-10", label: "1 to 10" },
    { value: "11-50", label: "11 to 50" }, { value: "51+", label: "51 or more" },
  ] },
  { key: "passHolders", text: "Do you employ Work Permit or S Pass holders?", options: [
    { value: "yes", label: "Yes" }, { value: "no", label: "No" },
  ] },
  { key: "premises", text: "Where does the business operate from?", options: [
    { value: "rent", label: "Rented office, shop or warehouse" },
    { value: "own", label: "Premises we own" },
    { value: "none", label: "Home or client sites" },
  ] },
  { key: "contracts", text: "Do clients, landlords or contracts ask for insurance certificates?", options: [
    { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" },
  ] },
];

export type Basis = "Required by law" | "Usually required" | "Recommended";
export type Result = { policy: string; basis: Basis; why: string; guide?: string };

export function recommend(a: Answers): Result[] {
  const out: Result[] = [];
  const hasStaff = !!a.staff && a.staff !== "none";
  const premises = a.premises === "rent" || a.premises === "own";
  const asked = a.contracts === "yes";

  if (hasStaff) out.push({ policy: "Work injury compensation", basis: "Required by law", why: "You have employees.", guide: "work-injury-compensation" });
  if (a.passHolders === "yes") out.push({ policy: "Foreign worker medical insurance and security bond", basis: "Required by law", why: "You employ Work Permit or S Pass holders.", guide: "foreign-worker-insurance" });
  if (premises || asked || a.sector === "fnb-retail" || a.sector === "construction")
    out.push({ policy: "Public liability", basis: premises || asked ? "Usually required" : "Recommended", why: premises ? "Landlords usually require it in the lease." : asked ? "Contracts usually set a minimum limit." : "Your work brings the public onto your premises or sites.", guide: "public-liability" });
  if (premises) out.push({ policy: "Property and business interruption", basis: a.premises === "rent" ? "Usually required" : "Recommended", why: a.premises === "rent" ? "Leases usually make the tenant insure fit-out." : "You own the premises.", guide: "property-and-business-interruption" });
  if (a.sector === "construction") out.push({ policy: "Contractor's all risks", basis: asked ? "Usually required" : "Recommended", why: "Covers the works and materials on site during a project." });
  if (a.sector === "professional" || (asked && a.sector !== "construction" && a.sector !== "fnb-retail"))
    out.push({ policy: "Professional indemnity", basis: asked ? "Usually required" : "Recommended", why: a.sector === "professional" ? "You sell advice, design or IT services." : "Client contracts often ask for it.", guide: "professional-indemnity" });
  if (a.staff === "11-50" || a.staff === "51+") out.push({ policy: "Employee benefits (group medical)", basis: "Recommended", why: "Common for teams above 10 staff." });
  if (a.staff === "51+") out.push({ policy: "Directors and officers liability", basis: "Recommended", why: "Larger companies face more claims against directors.", guide: "directors-and-officers" });
  if (!out.length) out.push({ policy: "Public liability", basis: "Recommended", why: "The usual starting cover for a company with no staff or premises.", guide: "public-liability" });
  return out;
}

export function summarise(a: Answers, results: Result[]): string {
  const ans = questions.map(q => {
    const label = q.options.find(o => o.value === a[q.key])?.label ?? "-";
    return `${q.text} ${q.key === "sector" && a.sector === "other" && a.sectorOther ? `Others: ${a.sectorOther}` : label}`;
  });
  return ["Cover finder answers:", ...ans, "", "Suggested cover:", ...results.map(r => `- ${r.policy} (${r.basis})`)].join("\n");
}
