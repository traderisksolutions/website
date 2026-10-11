// Blogs shown at /blogs, in the Resources menu and at /blogs/[slug].
// Order here is publication order, newest first. Add a blog by adding an entry.
import type { IconName } from "@/content";

export type Topic = "Group insurance" | "Perks" | "Employers";

export type Block =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] };

export type Blog = {
  slug: string;
  title: string;
  dek: string;
  topic: Topic;
  published: string; // YYYY-MM-DD
  updated?: string;
  minutes: number;
  /** Cover: one glyph, one tone, and the title as set on the cover, one string per line. */
  icon: IconName;
  tone: "ember" | "night" | "surface";
  cover: string[];
  body: Block[];
};

export const topics: Topic[] = ["Group insurance", "Perks", "Employers"];

export const blogs: Blog[] = [
  {
    slug: "perks-or-pay-rise",
    title: "Perks or a pay rise: what each dollar costs the employer",
    dek: "A S$100 raise costs more than S$100. Group benefits and perks are priced differently.",
    topic: "Perks",
    published: "2026-10-10",
    minutes: 4,
    icon: "pulse",
    tone: "ember",
    cover: ["Perks or", "a pay rise"],
    body: [
      { type: "p", text: "A raise is the simplest reward to give and the most expensive per dollar the employee notices. Employer CPF, bonus multipliers and future increments all build on base pay. Benefits sit outside that chain." },
      { type: "h2", text: "What a raise costs" },
      { type: "ul", items: [
        "Employer CPF applies to the raise. For employees aged 55 and below, the employer rate is 17% of wages up to the monthly ceiling.",
        "A S$100 monthly raise therefore costs S$117 a month, or S$1,404 a year, before bonuses.",
        "Bonuses expressed in months of salary grow with every raise.",
        "Raises are rarely reversed. The cost repeats every year.",
      ] },
      { type: "h2", text: "What benefits cost" },
      { type: "ul", items: [
        "Group insurance premiums are a fixed amount per employee per year, reviewed at renewal.",
        "Employer-paid group medical premiums do not attract CPF.",
        "Perk memberships are bought at group rates, below what an employee pays alone.",
      ] },
      { type: "h2", text: "Where each one fits" },
      { type: "p", text: "Pay should track the market rate for the role. Benefits cover the costs every employee faces regardless of role: hospital bills, travel data, transport, fitness. Spending on the second does not replace the first. It reduces how often pay has to do work it is expensive at." },
      { type: "h2", text: "Tax treatment" },
      { type: "p", text: "Medical benefits, including group medical insurance paid by the employer, are generally not taxable to the employee. Many lifestyle perks are benefits-in-kind, and some are taxable. IRAS publishes which benefits are taxable and how they are valued." },
    ],
  },
  {
    slug: "foreign-worker-medical-insurance",
    title: "Medical insurance for Work Permit and S Pass holders",
    dek: "The cover MOM requires, the co-payment split, and what the employer still pays.",
    topic: "Group insurance",
    published: "2026-10-06",
    minutes: 4,
    icon: "pulse",
    tone: "night",
    cover: ["Work Permit and", "S Pass medical"],
    body: [
      { type: "p", text: "Employers must buy and maintain medical insurance for every Work Permit and S Pass holder they employ. The employer is responsible for the employee's medical costs, and the insurance covers part of that responsibility." },
      { type: "h2", text: "Minimum cover" },
      { type: "ul", items: [
        "Inpatient care and day surgery, with an annual claim limit of at least S$60,000 per employee.",
        "Claims above S$15,000 are co-paid: the insurer pays 75% and the employer 25%.",
        "Cover must run for the whole period of employment and be renewed with the pass.",
      ] },
      { type: "h2", text: "What the employer still pays" },
      { type: "ul", items: [
        "Outpatient treatment, unless a separate outpatient plan is bought.",
        "The 25% co-payment above S$15,000.",
        "Bills above the annual limit.",
      ] },
      { type: "p", text: "Employers may not recover these costs from the employee's salary." },
      { type: "h2", text: "Putting it on a group plan" },
      { type: "p", text: "Work Permit and S Pass holders can be covered on the same group plan as other staff, with hospital, outpatient and accident cover set at the same level. One policy, one renewal date and one claims process replaces separate pass-by-pass policies." },
      { type: "h2", text: "What to check" },
      { type: "ul", items: [
        "The policy meets the current MOM minimum, not the one in force when it was first bought.",
        "New joiners are added before their pass is issued.",
        "Work injury compensation is a separate, additional requirement.",
      ] },
    ],
  },
  {
    slug: "group-hospital-surgical-insurance",
    title: "Group hospital and surgical insurance, explained",
    dek: "What a GHS plan pays, how it works with MediShield Life, and the four terms that set its value.",
    topic: "Group insurance",
    published: "2026-10-02",
    minutes: 5,
    icon: "pulse",
    tone: "surface",
    cover: ["Group hospital", "and surgical"],
    body: [
      { type: "p", text: "Group hospital and surgical insurance (GHS) pays hospital bills for employees, and optionally their families, while they are on the payroll. It is the core of most Singapore group benefits plans." },
      { type: "h2", text: "What it pays" },
      { type: "ul", items: [
        "Room and board, up to the ward class in the plan.",
        "Surgery, ICU, and hospital services such as tests and medicine.",
        "Pre- and post-hospital treatment within a set number of days.",
        "Day surgery that does not need an overnight stay.",
      ] },
      { type: "h2", text: "How it works with MediShield Life" },
      { type: "p", text: "MediShield Life covers every Singapore Citizen and Permanent Resident for large hospital bills, sized for subsidised wards. A GHS plan pays alongside it and alongside any Integrated Shield Plan the employee holds. How a claim is split depends on the policies involved." },
      { type: "h2", text: "The four terms that set its value" },
      { type: "ul", items: [
        "Ward class: 1-bed private, 2-bed, 4-bed or subsidised. This drives most of the premium.",
        "Limits: per-day room limits and per-condition limits, or as-charged cover.",
        "Pre-existing conditions: larger groups usually have them covered; small groups may not.",
        "Dependants: spouse and children added at the employer's or employee's cost.",
      ] },
      { type: "h2", text: "When cover ends" },
      { type: "p", text: "Cover stops when the employee leaves the payroll. Employees who rely on it should hold personal cover as well, because a new personal policy after diagnosis may exclude that condition." },
    ],
  },
  {
    slug: "first-benefits-plan",
    title: "A first benefits plan for a team of 10",
    dek: "What to cover first, what it costs to decide, and the data an insurer needs to quote.",
    topic: "Employers",
    published: "2026-09-28",
    minutes: 4,
    icon: "desk",
    tone: "surface",
    cover: ["A first plan", "for 10 people"],
    body: [
      { type: "p", text: "Most companies buy their first group plan between 5 and 20 employees, usually when a hire asks about benefits during an offer. A first plan should cover the large, unpredictable costs first and add everyday benefits after." },
      { type: "h2", text: "Order of cover" },
      { type: "ul", items: [
        "Hospital and surgical: the largest single bill an employee can face.",
        "Personal accident: pays on accidental injury or death, at work or outside it.",
        "Term life: a lump sum to the family.",
        "Outpatient GP and specialist: frequent, small claims. Add when the budget allows.",
        "Dental and lifestyle perks: last, and the most visible to employees.",
      ] },
      { type: "h2", text: "Data an insurer needs" },
      { type: "ul", items: [
        "Name, date of birth and gender for each employee.",
        "Job title or occupation class.",
        "Pass type for foreign employees.",
        "Dependants to include, if any.",
        "Current claims history, if a plan already exists.",
      ] },
      { type: "h2", text: "Decisions to make once" },
      { type: "ul", items: [
        "One plan for everyone, or tiers by grade.",
        "Whether dependants are paid for by the company or the employee.",
        "Whether new joiners are covered from day one or after probation.",
      ] },
      { type: "p", text: "Write these down. They become the benefits section of every offer letter." },
    ],
  },
];

export const bySlug = (slug: string) => blogs.find(b => b.slug === slug);

export const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
