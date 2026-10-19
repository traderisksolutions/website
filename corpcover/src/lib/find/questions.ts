// Find my cover: the question list, products and industry presets.
// Ported one to one from the find-routing prototype; wording, order and conditions match it.

export type Opt = { v: string; l: string };
export type Contact = { name?: string; company?: string; email?: string; cc?: string; phone?: string; consent?: boolean };
export type Slot = { day: string; time: string };
export type Upload = { name: string; size: number };
export type Answers = {
  [id: string]: string | string[] | Contact | Slot | Upload | undefined;
  contact?: Contact;
  slot?: Slot;
  upload?: Upload;
  needs?: string[];
  premises?: string[];
};
export type QType = "choice" | "multi" | "scale" | "text" | "long" | "number" | "upload" | "contact" | "booking" | "end";
export type Question = {
  id: string;
  type: QType;
  sec?: string;
  wide?: boolean;
  title?: string | ((a: Answers) => string);
  help?: string;
  ph?: string;
  opts?: Opt[];
  lo?: string;
  hi?: string;
  when?: (a: Answers) => boolean;
  optional?: (a: Answers) => boolean;
};

export const P = {
  select:  { name: "Premises package", form: "Select+ (7 trades) or Select+ Commercial", table: false },
  wic:     { name: "Work injury compensation", form: "Chubb Work Guard", table: false },
  gl:      { name: "Public liability", form: "General Liability, Comprehensive GL", table: false },
  pl:      { name: "Product liability and recall", form: "Product Liability, Chubb Assembly", table: false },
  pi:      { name: "Professional indemnity", form: "PI form for the profession (8 forms)", table: true },
  do:      { name: "Directors and officers", form: "D&O pre-underwritten, Elite V", table: true },
  cyber:   { name: "Cyber", form: "Cyber ERM SME, Short form", table: true },
  sef:     { name: "Invoice and payment fraud", form: "Social Engineering Fraud", table: true },
  gpa:     { name: "Staff personal accident", form: "GPA Enhanced, Select+ GPA", table: false },
  travel:  { name: "Business travel", form: "Group Business Travel Enhanced", table: false },
  cargo:   { name: "Goods in transit", form: "Marine Cargo", table: false },
  event:   { name: "Event liability", form: "Chubb Event Liability", table: false },
  tech:    { name: "Tech errors and omissions", form: "PremierTech", table: false },
  special: { name: "Specialist cover (medical, freight, funds, art, life sciences)", form: "11 specialist forms", table: false },
} as const;
export type ProductKey = keyof typeof P;
export const ORDER = Object.keys(P) as ProductKey[];
export const isProduct = (k: string): k is ProductKey => Object.prototype.hasOwnProperty.call(P, k);

/** [id, label, cover pre-selected on the Cover question]. */
export const IND: [string, string, ProductKey[]][] = [
  ["fnb", "Food and beverage", ["select", "wic", "gl", "cyber"]],
  ["retail", "Retail shop", ["select", "wic", "gl", "cyber"]],
  ["office", "Office or business services", ["select", "pi", "cyber", "sef"]],
  ["accounting", "Accounting firm", ["pi", "cyber", "sef", "do"]],
  ["realestate", "Real estate agency", ["pi", "select", "cyber"]],
  ["legal", "Law firm", ["pi", "cyber", "sef"]],
  ["design", "Architecture, engineering or design", ["pi", "gl", "wic"]],
  ["tech", "Software, IT or SaaS", ["tech", "cyber", "do", "sef"]],
  ["construction", "Construction contractor", ["wic", "gl", "gpa"]],
  ["manufacturing", "Manufacturing", ["pl", "select", "wic", "cargo"]],
  ["trading", "Trading, import or export", ["cargo", "pl", "sef"]],
  ["logistics", "Logistics or freight", ["special", "cargo", "wic", "gl"]],
  ["clinic", "Clinic, medical or dental", ["special", "select", "cyber"]],
  ["beauty", "Beauty, spa or fitness", ["select", "wic", "gl"]],
  ["education", "Education or tuition", ["select", "gpa", "gl"]],
  ["hotel", "Hotel or hospitality", ["select", "wic", "gl", "cyber"]],
  ["events", "Events and exhibitions", ["event", "wic", "gl"]],
  ["media", "Media, advertising or PR", ["pi", "sef"]],
  ["finance", "Fund or financial services", ["special", "do", "cyber"]],
  ["lifesci", "Pharma, biotech or devices", ["special", "pl", "do"]],
  ["other", "Something else", []],
];
/** The seven trades Select+ covers on its short form. */
export const SEVEN = ["fnb", "retail", "office", "beauty", "hotel", "education", "clinic"];
/** Industries the D&O pre-underwritten table excludes. */
export const DO_EXCL = ["finance", "lifesci", "construction", "education", "media"];

const o = (...pairs: [string, string][]): Opt[] => pairs.map(([v, l]) => ({ v, l }));
const YN = o(["no", "No"], ["yes", "Yes"]);
/** A string answer, or undefined. */
export const s = (a: Answers, k: string): string | undefined => (typeof a[k] === "string" ? (a[k] as string) : undefined);
export const has = (a: Answers, k: string) => Array.isArray(a.needs) && a.needs.includes(k);
const LIMITS = o(["500k", "S$500,000"], ["1m", "S$1m"], ["2m", "S$2m"], ["3m", "S$3m"], ["5m", "S$5m"], ["unsure", "Not sure"]);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const Q: Question[] = [
  { id: "industry", sec: "Your business", type: "choice", wide: true, title: "Which industry is your business in?", opts: IND.map(([v, l]) => ({ v, l })) },
  { id: "activity", type: "text", when: a => s(a, "industry") === "other", title: "In one line, what does the business do?", ph: "e.g. Two cafés serving brunch in the CBD" },
  { id: "founded", type: "number", title: "Which year was the company set up?", ph: "2019" },
  { id: "revenue", type: "choice", title: "Revenue in the last financial year", opts: o(["r1", "Up to S$1m"], ["r10", "S$1m to S$10m"], ["r25", "S$10m to S$25m"], ["r50", "S$25m to S$50m"], ["rmore", "Above S$50m"]) },
  { id: "usca", type: "choice", title: "Does 10% or more of revenue come from the USA or Canada?", opts: YN },
  { id: "staff", type: "choice", title: "How many employees, not counting directors?", opts: o(["0", "None"], ["10", "1 to 10"], ["50", "11 to 50"], ["more", "51 or more"]) },
  { id: "manual", when: a => !!s(a, "staff") && s(a, "staff") !== "0", title: "What share of them do manual work?", help: "Work injury insurance is compulsory for manual staff, and for office staff earning S$2,600 a month or less.", type: "scale", lo: "All office", hi: "All manual", opts: Array.from({ length: 11 }, (_, k) => ({ v: String(k * 10), l: `${k * 10}%` })) },
  { id: "premises", type: "multi", title: "Where does the business operate from?", help: "Choose all that apply.", opts: o(["rent", "Rented office, shop or warehouse"], ["own", "Premises we own"], ["none", "Home or client sites"]) },
  { id: "locations", type: "choice", when: a => Array.isArray(a.premises) && (a.premises.includes("rent") || a.premises.includes("own")), title: "How many locations?", opts: o(["1", "One"], ["2-5", "2 to 5"], ["6+", "6 or more"]) },
  { id: "insured", type: "choice", title: "Do you have business insurance today?", opts: o(["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]) },
  { id: "renewal", type: "choice", wide: true, when: a => s(a, "insured") === "yes", title: "When does it renew?", opts: [...MONTHS.map(m => ({ v: m, l: m })), { v: "unsure", l: "Not sure" }] },

  { id: "needs", sec: "Cover", type: "multi", wide: true, title: "Which cover would you like to discuss?", help: "Pre-selected for your industry. Change anything.", opts: [...ORDER.map(k => ({ v: k, l: P[k].name })), { v: "unsure", l: "Not sure, recommend for me" }] },
  { id: "sp_value", type: "choice", when: a => has(a, "select"), title: "Value of contents, stock and renovation, all locations together", opts: o(["100k", "Under S$100,000"], ["500k", "S$100,000 to S$500,000"], ["2m", "S$500,000 to S$2m"], ["5m", "S$2m to S$5m"], ["more", "Above S$5m"]) },
  { id: "wic_wages", type: "choice", when: a => has(a, "wic"), title: "Total yearly wages, all employees", opts: o(["250k", "Under S$250,000"], ["1m", "S$250,000 to S$1m"], ["3m", "S$1m to S$3m"], ["more", "Above S$3m"]) },
  { id: "gl_site", type: "choice", when: a => has(a, "gl"), title: "Does your team work at client sites or in public spaces?", opts: YN },
  { id: "gl_haz", type: "choice", when: a => has(a, "gl") || (has(a, "wic") && Number(s(a, "manual")) > 0), title: "Any work at height, hot work or demolition?", opts: YN },
  { id: "pl_what", type: "text", when: a => has(a, "pl"), title: "What do you make or sell?", ph: "e.g. Stainless steel kitchen equipment" },
  { id: "pl_us", type: "choice", when: a => has(a, "pl") && s(a, "usca") !== "yes", title: "Do your products reach the USA or Canada, directly or through customers?", opts: o(["no", "No"], ["yes", "Yes"], ["unsure", "Not sure"]) },
  { id: "pi_service", type: "choice", when: a => has(a, "pi"), title: "Which best describes your professional service?", opts: o(["accounting", "Accounting or tax"], ["legal", "Legal"], ["design", "Architecture or engineering"], ["realestate", "Real estate agency"], ["it", "IT consulting"], ["media", "Media or marketing"], ["other", "Other advice or consulting"]) },
  { id: "pi_fees", type: "choice", when: a => has(a, "pi"), title: "Yearly fee income", opts: o(["200k", "Under S$200,000"], ["1m", "S$200,000 to S$1m"], ["3m", "S$1m to S$3m"], ["more", "Above S$3m"]) },
  { id: "pi_limit", type: "choice", when: a => has(a, "pi"), title: "Limit you would like for professional indemnity", opts: LIMITS },
  { id: "do_listed", type: "choice", when: a => has(a, "do"), title: "Is the company listed, or planning to list?", opts: o(["no", "No"], ["listed", "Listed"], ["planning", "Planning to list"]) },
  { id: "do_limit", type: "choice", when: a => has(a, "do"), title: "Limit you would like for directors and officers", opts: LIMITS },
  { id: "cy_records", type: "choice", when: a => has(a, "cyber"), title: "How many customer or employee records do you hold?", opts: o(["10k", "Under 10,000"], ["100k", "10,000 to 100,000"], ["1m", "100,000 to 1 million"], ["more", "Over 1 million"]) },
  { id: "cy_mfa", type: "choice", when: a => has(a, "cyber"), title: "Is multi-factor login on for email and remote access?", help: "A VPN alone does not count.", opts: o(["yes", "Yes, everywhere"], ["partly", "Partly"], ["no", "No"], ["unsure", "Not sure"]) },
  { id: "cy_backup", type: "choice", when: a => has(a, "cyber"), title: "Do you keep backups separate from your main systems?", opts: o(["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]) },
  { id: "cy_limit", type: "choice", when: a => has(a, "cyber"), title: "Limit you would like for cyber", opts: o(["250k", "S$250,000"], ["500k", "S$500,000"], ["1m", "S$1m"], ["2m", "S$2m"], ["3m", "S$3m"], ["unsure", "Not sure"]) },
  { id: "sef_hit", type: "choice", when: a => has(a, "sef"), title: "Has the business ever paid, or nearly paid, a fake invoice or a changed bank account?", opts: YN },
  { id: "gpa_heads", type: "number", when: a => has(a, "gpa"), title: "How many people should personal accident cover?", ph: "12" },
  { id: "tr_trips", type: "choice", when: a => has(a, "travel"), title: "Business trips a year, whole team", opts: o(["10", "Under 10"], ["50", "10 to 50"], ["more", "More than 50"]) },
  { id: "tr_where", type: "choice", when: a => has(a, "travel"), title: "Where do they travel?", opts: o(["asia", "Asia only"], ["world", "Worldwide, including the USA"]) },
  { id: "cg_value", type: "choice", when: a => has(a, "cargo"), title: "Yearly value of goods shipped", opts: o(["1m", "Under S$1m"], ["10m", "S$1m to S$10m"], ["more", "Above S$10m"]) },
  { id: "cg_terms", type: "choice", when: a => has(a, "cargo"), title: "Usual trade terms on your shipments", help: "Under CIF the seller usually insures. Under FOB the buyer does.", opts: o(["fob", "FOB or EXW"], ["cif", "CIF or CIP"], ["ddp", "DDP or DAP"], ["mix", "A mix"], ["unsure", "Not sure"]) },
  { id: "ev_size", type: "choice", when: a => has(a, "event"), title: "Largest event in the next 12 months", opts: o(["500", "Under 500 people"], ["5000", "500 to 5,000"], ["more", "Over 5,000"]) },
  { id: "tech_what", type: "choice", when: a => has(a, "tech"), title: "What do you provide?", opts: o(["saas", "Software or SaaS"], ["services", "IT services or consulting"], ["hardware", "Hardware or devices"], ["other", "Something else"]) },
  { id: "special", type: "long", when: a => has(a, "special") || has(a, "unsure"), title: a => has(a, "special") ? "Tell us about the specialist cover you need" : "Anything the adviser should know before the call?", ph: "Type here. Shift + Enter for a new line.", optional: a => !has(a, "special") },

  { id: "claims", sec: "History", type: "choice", title: "Any claims, or anything that could lead to one, in the last 5 years?", opts: YN },
  { id: "claims_what", type: "long", when: a => s(a, "claims") === "yes", title: "Briefly, what happened?", ph: "Year, what happened, amount if known" },
  { id: "declined", type: "choice", title: "Has an insurer ever declined, cancelled or refused to renew your cover?", opts: YN },
  { id: "upload", type: "upload", when: a => s(a, "insured") === "yes", optional: () => true, title: "Upload your current policy schedule", help: "Optional. PDF or photo, up to 20 MB. The adviser reviews it before the call." },

  { id: "contact", sec: "Contact", type: "contact", title: "Who should the adviser speak to?" },
  { id: "format", type: "choice", title: "How would you like to meet?", opts: o(["meet", "Google Meet"], ["whatsapp", "WhatsApp call"]) },
  // Calendar is not connected yet: the visitor picks a preferred time and an adviser confirms it.
  { id: "slot", type: "booking", title: "Pick a preferred time", help: "30 minutes. Times in Singapore (SGT)." },
  { id: "done", type: "end" },
];
export const QBY: Record<string, Question> = Object.fromEntries(Q.map(q => [q.id, q]));

/** Questions shown for these answers, in order. */
export const visible = (a: Answers) => Q.filter(q => !q.when || q.when(a));
export const titleOf = (q: Question, a: Answers) => (typeof q.title === "function" ? q.title(a) : q.title ?? "");
/** Section label for a question: the nearest `sec` at or above it. */
export function sectionOf(q: Question) {
  for (let k = Q.indexOf(q); k >= 0; k--) if (Q[k].sec) return Q[k].sec!;
  return "";
}
/** Cover pre-selected for an industry. */
export const presetNeeds = (industry?: string): string[] => [...(IND.find(x => x[0] === industry)?.[2] ?? [])];

export const KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** [country, dialling code, placeholder]. */
export const CC: [string, string, string][] = [
  ["SG", "+65", "8123 4567"], ["HK", "+852", "5123 4567"], ["CN", "+86", "131 2345 6789"], ["ID", "+62", "812 3456 7890"], ["MY", "+60", "12 345 6789"],
  ["TH", "+66", "81 234 5678"], ["VN", "+84", "91 234 56 78"], ["PH", "+63", "917 123 4567"], ["BN", "+673", "712 3456"], ["KH", "+855", "12 345 678"],
  ["LA", "+856", "20 2345 6789"], ["MM", "+95", "9 212 3456"], ["TL", "+670", "7723 4567"],
];

/* ── Preferred time: next 5 working days in Singapore, every slot selectable ── */
export const TIMES = ["09:30", "11:00", "14:00", "15:30", "17:00"];
export const TZ = "Asia/Singapore";

/** The next 5 Mon–Fri dates after today in Singapore, as YYYY-MM-DD. */
export function workingDays(now = new Date()): string[] {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const d = new Date(`${today}T12:00:00Z`);
  const out: string[] = [];
  while (out.length < 5) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
const dayFmt = (opts: Intl.DateTimeFormatOptions) => (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-SG", { ...opts, timeZone: "UTC" });
export const dayLabel = dayFmt({ weekday: "short", day: "numeric", month: "short" });
export const dayWeekday = dayFmt({ weekday: "short" });
export const dayMonth = dayFmt({ month: "short" });
export const dayNum = (iso: string) => String(Number(iso.slice(8, 10)));

/* ── Validation, messages as in the prototype ── */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validate(q: Question, a: Answers, year = new Date().getFullYear()): string {
  const v = a[q.id], optional = q.optional && q.optional(a);
  if (q.type === "contact") {
    const c = a.contact || {};
    if (!c.name || c.name.trim().length < 2) return "Enter your name.";
    if (!c.company || c.company.trim().length < 2) return "Enter the company name.";
    if (!EMAIL_RE.test(c.email || "")) return "Enter a valid email.";
    const d = (c.phone || "").replace(/\D/g, "").length;
    if (d < 7 || d > 12) return "Enter the phone number without the country code.";
    if (!c.consent) return "Tick the consent box to continue.";
    return "";
  }
  if (q.type === "booking") return a.slot && a.slot.time ? "" : "Pick a day and a time.";
  if (optional) return "";
  if (q.type === "multi") return Array.isArray(v) && v.length ? "" : "Choose at least one.";
  if (q.type === "number") {
    if (q.id === "founded") { const y = Number(v); return y >= 1900 && y <= year ? "" : `Enter a year between 1900 and ${year}.`; }
    return Number(v) > 0 ? "" : "Enter a number.";
  }
  return v != null && String(v).trim() !== "" ? "" : (q.type === "choice" ? "Choose an option." : "Please fill this in.");
}
