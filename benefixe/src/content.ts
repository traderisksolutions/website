// Every perk, plan and FAQ on the site. Pages read from here; nothing is hardcoded in JSX.
// Offer figures and values are PLACEHOLDERS until partner agreements are signed.
// Set `partner` when a brand is confirmed; the perk name shows until then.

export type Category = "Travel" | "Move" | "Wellness" | "Everyday";
export type IconName =
  | "sim" | "lounge" | "hotel" | "bike" | "car" | "taxi" | "dumbbell" | "mind"
  | "tooth" | "pulse" | "physio" | "moon" | "bag" | "coffee" | "desk" | "book" | "phone" | "shirt";

export type Perk = {
  name: string;
  partner?: string;
  offer: string;
  about: string;
  category: Category;
  icon: IconName;
  /** Retail value to one member over 12 months, SGD. */
  value: number;
  featured?: boolean;
  isNew?: boolean;
};

export const categories: Category[] = ["Travel", "Move", "Wellness", "Everyday"];

export const categoryTone: Record<Category, string> = {
  Travel: "bg-tile-sky",
  Move: "bg-tile-sage",
  Wellness: "bg-tile-blush",
  Everyday: "bg-tile-sand",
};

export const perks: Perk[] = [
  { name: "Asia eSIM", offer: "10GB data a month in 14 countries", about: "Install once. Data switches on when you land.", category: "Travel", icon: "sim", value: 360, featured: true },
  { name: "Airport lounges", offer: "4 lounge visits a year", about: "Changi and 1,300 airports worldwide.", category: "Travel", icon: "lounge", value: 200, featured: true },
  { name: "Hotel booking", offer: "8% back on hotel stays", about: "Credited to your account after check-out.", category: "Travel", icon: "hotel", value: 150 },
  { name: "Bike rental", offer: "60 ride minutes a day", about: "Shared bikes and e-bikes across Singapore.", category: "Move", icon: "bike", value: 480, featured: true },
  { name: "Car sharing", offer: "S$30 drive credit a month", about: "Hourly cars from 1,500 parking spots.", category: "Move", icon: "car", value: 360 },
  { name: "Airport rides", offer: "S$10 off, 12 rides a year", about: "Ride-hailing to and from Changi.", category: "Move", icon: "taxi", value: 120 },
  { name: "Gym and studio pass", offer: "6 classes a month", about: "Gyms, yoga, spin and pilates at 400 studios.", category: "Wellness", icon: "dumbbell", value: 540, featured: true },
  { name: "Counselling", offer: "4 sessions a year", about: "Licensed counsellors, video or in person.", category: "Wellness", icon: "mind", value: 480, featured: true },
  { name: "Dental", offer: "1 scale and polish a year", about: "At 60 partner clinics.", category: "Wellness", icon: "tooth", value: 90 },
  { name: "Health screening", offer: "1 screening a year, 60 markers", about: "Blood panel and doctor review.", category: "Wellness", icon: "pulse", value: 180, featured: true },
  { name: "Physiotherapy", offer: "25% off every session", about: "Sports injuries, back and neck.", category: "Wellness", icon: "physio", value: 100 },
  { name: "Sleep and meditation", offer: "12 months premium", about: "Guided sleep, focus and breathing.", category: "Wellness", icon: "moon", value: 90, isNew: true },
  { name: "Food delivery", offer: "Free delivery over S$15", about: "Lunch at the office, dinner at home.", category: "Everyday", icon: "bag", value: 120 },
  { name: "Coffee", offer: "1 free coffee a week", about: "At 80 independent cafés.", category: "Everyday", icon: "coffee", value: 260, featured: true },
  { name: "Co-working", offer: "1 day pass a month", about: "Desks in 30 spaces across the island.", category: "Everyday", icon: "desk", value: 360, featured: true },
  { name: "Online courses", offer: "12 months unlimited", about: "Design, data, finance and languages.", category: "Everyday", icon: "book", value: 240, isNew: true },
  { name: "Phone repair", offer: "20% off repairs", about: "Screens and batteries, same day.", category: "Everyday", icon: "phone", value: 40 },
  { name: "Laundry", offer: "S$15 laundry credit a month", about: "Pickup and delivery to your door.", category: "Everyday", icon: "shirt", value: 180 },
];

export const pass = {
  name: "Insider Pass",
  priceYear: 240,
  priceMonth: 20,
  perkCount: perks.length,
  totalValue: perks.reduce((s, p) => s + p.value, 0),
};

export const sgd = (n: number) => `S$${n.toLocaleString("en-SG")}`;

export const passIncludes = [
  `All ${perks.length} perks, active the day you join`,
  "New partners added through the year",
  "One member page with every code and link",
  "Cancel within 14 days for a full refund",
];

export const passSteps = [
  { title: "Join", body: "Pay yearly, or get the pass through your employer." },
  { title: "Activate", body: "Every code and link sits on your member page." },
  { title: "Use", body: "Show the pass or enter the code at each partner." },
];

export const passFaqs = [
  { q: "Who can join", a: "Anyone aged 18 and over who lives or works in Singapore." },
  { q: "How perks are redeemed", a: "Each perk has a code, a link or a member QR on your member page. Partners verify the pass at checkout or at the counter." },
  { q: "Monthly limits", a: "Monthly allowances reset on the 1st. Unused minutes, classes and credits do not carry over." },
  { q: "New partners", a: "Partners are added through the year at no extra cost. Members receive an email when a perk goes live." },
  { q: "Cancellation", a: "Cancel within 14 days of joining for a full refund. After 14 days the pass runs to the end of the membership year." },
  { q: "Pass through an employer", a: "Every employee on a Benefixe group plan receives the Insider Pass at no extra cost. It stays active while the employee is on the plan." },
];

export type Cover = { name: string; short: string; body: string };

export const covers: Cover[] = [
  { name: "Group hospital and surgical", short: "GHS", body: "Ward, surgery, ICU and pre- and post-hospital treatment." },
  { name: "Outpatient GP and specialist", short: "GP/SP", body: "Clinic visits, specialist referrals and prescribed medicine." },
  { name: "Group term life", short: "GTL", body: "A lump sum to the family on death or total disability." },
  { name: "Group personal accident", short: "GPA", body: "Accidental death, injury and medical expenses, 24 hours a day." },
  { name: "Dental", short: "DEN", body: "Check-ups, fillings and extractions at panel clinics." },
  { name: "Insider Pass", short: "PASS", body: `${perks.length} lifestyle perks for every covered employee.` },
];

export type Plan = { name: string; for: string; includes: string[]; highlight?: boolean };

export const plans: Plan[] = [
  { name: "Essentials", for: "3 to 20 employees", includes: ["Group hospital and surgical", "Group term life", "Group personal accident", "Insider Pass for every employee"] },
  { name: "Plus", for: "10 to 200 employees", includes: ["Everything in Essentials", "Outpatient GP and specialist", "Dental", "Insider Pass for every employee"], highlight: true },
  { name: "Complete", for: "50 employees and above", includes: ["Everything in Plus", "Dependants on hospital cover", "Annual health screening", "Insider Pass for employees and spouses"] },
];

export const groupSteps = [
  { title: "Census", body: "Send names, birth dates and roles. A spreadsheet is fine." },
  { title: "Quote", body: "Plans from 3 insurers, side by side, in 5 working days." },
  { title: "Enrol", body: "Employees receive cover cards and Insider Pass invites." },
  { title: "Renew", body: "Claims and usage reviewed 60 days before renewal." },
];

export const groupFaqs = [
  { q: "Minimum company size", a: "3 employees. Sole proprietors and partnerships with 3 or more staff qualify." },
  { q: "Foreign employees", a: "Employment Pass, S Pass and Work Permit holders can be covered on the same plan." },
  { q: "Pre-existing conditions", a: "Most group plans for 10 or more employees waive pre-existing condition exclusions. Smaller groups may need a short health declaration." },
  { q: "Joiners and leavers", a: "Add or remove employees each month. Premiums adjust pro rata." },
  { q: "Insider Pass for leavers", a: "The pass stays active until the end of the month the employee leaves the plan. They can then keep it on a personal membership." },
];

export const contact = { email: "hello@benefixe.com" };
