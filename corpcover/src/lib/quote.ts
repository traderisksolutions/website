// Get covered: the quote request, modelled on Corgi's flow (business type → cover → about the
// business → contact → call). Liability and asset cover first. Shared by the flow and its route.

export const COVER_GROUPS: { name: string; items: string[] }[] = [
  { name: "Liability", items: ["Public liability", "Product liability", "Professional indemnity", "Directors and officers", "Cyber liability", "Work injury compensation"] },
  { name: "Assets", items: ["Commercial property and fire", "Business all risks", "Business interruption", "Contractor's all risks", "Machinery breakdown", "Goods in transit and marine cargo"] },
  { name: "Other", items: ["Something else"] },
];
export const COVERS = COVER_GROUPS.flatMap(g => g.items);
export const NOT_SURE = "Not sure – help me choose";

/** Business types, grouped. `k` = search synonyms; `c` = cover usually held (shown as "Common for …", editable). */
export type BizType = { id: string; label: string; group: string; k: string; c: string[] };
const PL = "Public liability", PR = "Product liability", PI = "Professional indemnity", DO = "Directors and officers", CY = "Cyber liability", WI = "Work injury compensation";
const FI = "Commercial property and fire", BA = "Business all risks", BI = "Business interruption", CA = "Contractor's all risks", MB = "Machinery breakdown", GT = "Goods in transit and marine cargo";

export const BIZ: BizType[] = [
  { id: "accounting", label: "Accounting or tax firm", group: "Professional services", k: "cpa audit bookkeeping corporate secretary", c: [PI, CY, DO] },
  { id: "law", label: "Law firm", group: "Professional services", k: "lawyer legal solicitor", c: [PI, CY] },
  { id: "architecture", label: "Architecture or engineering firm", group: "Professional services", k: "architect engineer qp design consultant", c: [PI, PL] },
  { id: "consulting", label: "Management consultancy", group: "Professional services", k: "consultant advisory", c: [PI, CY, DO] },
  { id: "agency", label: "Marketing, design or advertising agency", group: "Professional services", k: "creative branding media pr digital", c: [PI, CY] },
  { id: "recruitment", label: "Recruitment or HR agency", group: "Professional services", k: "staffing employment manpower", c: [PI, WI, CY] },
  { id: "realestate", label: "Real estate agency", group: "Professional services", k: "property agent salesperson", c: [PI, PL] },
  { id: "finance", label: "Financial services or fund", group: "Professional services", k: "fund manager wealth family office", c: [PI, DO, CY] },
  { id: "saas", label: "Software or SaaS company", group: "Technology", k: "tech startup app platform software", c: [PI, CY, DO] },
  { id: "it", label: "IT services or managed services", group: "Technology", k: "msp systems integrator it support", c: [PI, CY, PL] },
  { id: "ecommerce", label: "E-commerce or online seller", group: "Technology", k: "shopee lazada amazon online store dtc", c: [PR, CY, GT] },
  { id: "fintech", label: "Fintech or payments", group: "Technology", k: "payments wallet crypto", c: [PI, CY, DO] },
  { id: "restaurant", label: "Restaurant, café or bar", group: "F&B and retail", k: "f&b fnb food cafe coffee bar hawker eatery", c: [PL, FI, BI, WI] },
  { id: "foodmfg", label: "Central kitchen or food manufacturer", group: "F&B and retail", k: "f&b fnb catering bakery food production", c: [PR, FI, MB, WI] },
  { id: "retail", label: "Retail shop", group: "F&B and retail", k: "store boutique mall outlet", c: [PL, BA, BI] },
  { id: "renovation", label: "Renovation or interior design contractor", group: "Construction and facilities", k: "id fit-out fitout hdb condo reno", c: [CA, PL, WI] },
  { id: "contractor", label: "Main contractor or builder", group: "Construction and facilities", k: "construction builder gb1 gb2", c: [CA, PL, WI] },
  { id: "subcontractor", label: "M&E or specialist subcontractor", group: "Construction and facilities", k: "mechanical electrical plumbing aircon acmv trade", c: [WI, PL, CA] },
  { id: "cleaning", label: "Cleaning or facility services", group: "Construction and facilities", k: "facilities management janitorial pest control security", c: [PL, WI] },
  { id: "forwarder", label: "Freight forwarder", group: "Logistics", k: "shipping logistics customs nvocc", c: [GT, PL, PI] },
  { id: "transport", label: "Transport or delivery company", group: "Logistics", k: "courier lorry trucking last mile", c: [GT, PL, WI] },
  { id: "warehouse", label: "Warehouse or 3PL", group: "Logistics", k: "storage fulfilment distribution", c: [FI, BA, PL, WI] },
  { id: "manufacturer", label: "Manufacturer or factory", group: "Manufacturing and trading", k: "factory production plant fabrication", c: [FI, MB, PR, BI] },
  { id: "trading", label: "Trading or import-export", group: "Manufacturing and trading", k: "wholesale distributor importer exporter", c: [GT, PR, FI] },
  { id: "rental", label: "Machinery or equipment rental", group: "Manufacturing and trading", k: "plant hire equipment leasing", c: [MB, PL, BA] },
  { id: "clinic", label: "Clinic or medical practice", group: "Health and personal care", k: "gp doctor medical healthcare tcm physio", c: [PL, PI, FI, CY] },
  { id: "dental", label: "Dental clinic", group: "Health and personal care", k: "dentist orthodontist", c: [PL, PI, FI] },
  { id: "beauty", label: "Beauty salon, spa or aesthetics", group: "Health and personal care", k: "salon spa massage nail hair aesthetic", c: [PL, PI, BA] },
  { id: "gym", label: "Gym or fitness studio", group: "Health and personal care", k: "fitness yoga pilates martial arts", c: [PL, BA] },
  { id: "tuition", label: "Tuition or enrichment centre", group: "Education and events", k: "education tutor school learning centre", c: [PL, BA] },
  { id: "preschool", label: "Preschool or childcare", group: "Education and events", k: "kindergarten childcare infant care", c: [PL, FI, WI] },
  { id: "events", label: "Events or exhibitions", group: "Education and events", k: "event organiser mice concert wedding", c: [PL, BA, WI] },
  { id: "landlord", label: "Commercial landlord", group: "Property", k: "property owner building owner shophouse", c: [FI, BI, PL] },
  { id: "mcst", label: "Property management or MCST", group: "Property", k: "strata condo management managing agent", c: [FI, PL, DO] },
  { id: "coworking", label: "Coworking or serviced office", group: "Property", k: "shared office business centre", c: [PL, BA, BI] },
  { id: "other", label: "Other – my business isn't listed", group: "Other", k: "other none", c: [] },
];
export const BIZ_BY_ID: Record<string, BizType> = Object.fromEntries(BIZ.map(b => [b.id, b]));

export const HEADCOUNT = ["Just me", "2 to 10", "11 to 50", "51 to 200", "Over 200"];
export const ROLES = ["Owner or director", "Manager", "Employee"];
export const FORMATS = [["meet", "Google Meet"], ["whatsapp", "WhatsApp call"], ["phone", "Phone call"]] as const;
export const SLOTS = ["Morning", "Afternoon", "Evening"];

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const UEN_RE = /^[0-9A-Z]{9,10}$/i;

export type QuoteState = {
  biz: string; covers: string[]; company: string; uen: string; headcount: string; neededBy: string; claims: string; contract: string;
  firstName: string; lastName: string; role: string; email: string; cc: string; phone: string;
  format: string; day: string; slot: string; notes: string; consent: boolean;
  /** Answers to the cover-specific questions (EXTRA_Q), by question id. */
  extra: Record<string, string>;
};
export const EMPTY: QuoteState = {
  biz: "", covers: [], company: "", uen: "", headcount: "", neededBy: "", claims: "", contract: "",
  firstName: "", lastName: "", role: "", email: "", cc: "+65", phone: "", format: "", day: "", slot: "", notes: "", consent: false, extra: {},
};

/** Questions asked only for the cover chosen, after contact details are in (Corgi order:
 *  business → contact → questions). Drawn from the insurers' proposal forms; all optional. */
export type ExtraQ = { id: string; cover: string | null; label: string; opts?: string[]; ph?: string };
export const EXTRA_Q: ExtraQ[] = [
  { id: "turnover", cover: null, label: "Annual turnover", opts: ["Under 500k", "500k to 1m", "1m to 5m", "5m to 20m", "Over 20m"] },
  { id: "visitors", cover: "Public liability", label: "Do customers or visitors come to your premises?", opts: ["Yes", "No"] },
  { id: "pl_sales", cover: "Product liability", label: "Where are your products sold?", opts: ["Home market only", "Asia", "Worldwide, including US and Canada"] },
  { id: "pi_fees", cover: "Professional indemnity", label: "Annual fee income from professional services", ph: "e.g. 800,000" },
  { id: "do_funding", cover: "Directors and officers", label: "Has the company raised outside funding or plan to?", opts: ["No", "Yes, raised", "Planning to raise"] },
  { id: "cyber_records", cover: "Cyber liability", label: "Customer records you hold", opts: ["Under 1,000", "1,000 to 10,000", "Over 10,000"] },
  { id: "wic_manual", cover: "Work injury compensation", label: "Staff doing manual work", opts: ["None", "1 to 10", "11 to 50", "Over 50"] },
  { id: "contents_value", cover: "Commercial property and fire", label: "Value of contents, stock and renovations", ph: "e.g. 350,000" },
  { id: "bar_value", cover: "Business all risks", label: "Value of equipment and stock to insure", ph: "e.g. 120,000" },
  { id: "gross_profit", cover: "Business interruption", label: "Annual gross profit", ph: "e.g. 600,000" },
  { id: "car_contract", cover: "Contractor's all risks", label: "Value of the largest current contract", ph: "e.g. 1,200,000" },
  { id: "mb_value", cover: "Machinery breakdown", label: "Value of machinery", ph: "e.g. 250,000" },
  { id: "git_value", cover: "Goods in transit and marine cargo", label: "Value of the largest single shipment", ph: "e.g. 80,000" },
];
export const extraFor = (covers: string[]) => EXTRA_Q.filter(q => q.cover === null || covers.includes(q.cover));

/** Problems for one step, in order; empty when the step is complete. Used by the flow and re-run by the route.
 *  Steps: 0 business type · 1 contact (the lead is saved here) · 2 cover · 3 about the business · 4 call. */
export function stepError(step: number, s: QuoteState, ccs: string[], market = "sg"): string {
  if (step === 0) return BIZ_BY_ID[s.biz] ? "" : "Choose your business type.";
  if (step === 1) {
    if (s.company.trim().length < 2) return "Enter the company name.";
    if (!s.firstName.trim() || !s.lastName.trim()) return "Enter your first and last name.";
    if (!ROLES.includes(s.role)) return "Choose your role.";
    if (!EMAIL_RE.test(s.email.trim())) return "Enter a valid work email.";
    if (!ccs.includes(s.cc)) return "Choose a country code.";
    const d = s.phone.replace(/\D/g, "").length;
    if (d < 7 || d > 12) return "Enter the phone number without the country code.";
    if (!s.consent) return "Tick the consent box to continue.";
    return "";
  }
  if (step === 2) return s.covers.length ? "" : "Choose at least one cover, or Not sure.";
  if (step === 3) {
    if (s.uen.trim() && market === "sg" && !UEN_RE.test(s.uen.trim())) return "UEN is 9 or 10 letters and digits.";
    if (s.uen.trim() && market !== "sg" && !/^[0-9A-Z-]{4,20}$/i.test(s.uen.trim())) return "Check the registration number.";
    if (!HEADCOUNT.includes(s.headcount)) return "Choose the number of staff.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.neededBy)) return "Choose the date you need cover from.";
    if (!["yes", "no"].includes(s.claims)) return "Answer the claims question.";
    return "";
  }
  if (step === 4) {
    if (!FORMATS.some(f => f[0] === s.format)) return "Choose how to meet.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.day) || !SLOTS.includes(s.slot)) return "Choose a day and a time of day.";
    return "";
  }
  return "";
}
