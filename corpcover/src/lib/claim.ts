// Claim second opinion: a policyholder whose claim was rejected, reduced or delayed sends the details,
// gets an AI read of the claim against the policy wording, and a call with a second adviser.
// Shared by the intake and its route.

export const PLANS = {
  personal: { label: "Personal claim", price: "US$10", value: 10, note: "Travel, health, motor, home or personal accident" },
  business: { label: "Business claim", price: "US$200", value: 200, note: "Property, business interruption, liability, work injury, cargo" },
} as const;
export type Plan = keyof typeof PLANS;

/** Hours from receiving the documents to sending the PDF report. Test phase, 22 Oct 2026. */
export const SLA_HOURS = 24;

/** The service, end to end. One source for the page, the form, the paid page and the FAQ. */
export const PROCESS: [string, string][] = [
  ["Pay by card", "Send the claim details and pay online. The payment page is run by Stripe."],
  ["Send the documents", "Reply to our email with the policy schedule, the wording and the insurer's letter."],
  [`PDF report within ${SLA_HOURS} hours`, "Each reason the insurer gave, set against the clause it relies on: supported, not supported or unclear."],
  ["A broker follows up", "A broker who did not sell you the policy replies in the same email thread."],
];

/** Stripe Payment Links, one per plan. Unset: the form ends on "we email you a payment link". */
const PAYMENT_LINKS: Record<Plan, string | undefined> = {
  personal: process.env.NEXT_PUBLIC_STRIPE_LINK_PERSONAL,
  business: process.env.NEXT_PUBLIC_STRIPE_LINK_BUSINESS,
};

/** The plan's payment page with the email prefilled and the intake id attached, or null when not configured. */
export function paymentUrl(plan: Plan, email: string, id: string): string | null {
  const base = PAYMENT_LINKS[plan];
  if (!base) return null;
  try {
    const u = new URL(base);
    u.searchParams.set("prefilled_email", email);
    u.searchParams.set("client_reference_id", id);
    return u.toString();
  } catch { return null; }
}

export const CLAIM_TYPES: Record<Plan, string[]> = {
  personal: ["Travel", "Health or hospitalisation", "Motor", "Home or contents", "Personal accident", "Life or critical illness", "Other personal claim"],
  business: ["Fire or property damage", "Business interruption", "Public or product liability", "Professional indemnity", "Work injury or employees' compensation", "Goods in transit or marine cargo", "Burglary, theft or fidelity", "Other business claim"],
};
export const STATUSES = ["Rejected", "Partly paid", "Delayed or no reply", "Not made yet, preparing", "With a dispute body already"];
export const DOCS = ["Policy schedule", "Policy wording", "Claim form", "Insurer's decision letter", "Emails with the insurer or adjuster", "Photos, receipts or reports"];

export type ClaimState = {
  plan: Plan | ""; type: string; status: string; insurer: string; amount: string; decisionDate: string; docs: string[]; story: string;
  name: string; email: string; cc: string; phone: string; consent: boolean; ack: boolean;
};
export const EMPTY_CLAIM: ClaimState = { plan: "", type: "", status: "", insurer: "", amount: "", decisionDate: "", docs: [], story: "", name: "", email: "", cc: "+65", phone: "", consent: false, ack: false };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function claimStepError(step: number, s: ClaimState, ccs: string[]): string {
  if (step === 0) return s.plan ? "" : "Choose personal or business.";
  if (step === 1) {
    if (!s.plan || !CLAIM_TYPES[s.plan].includes(s.type)) return "Choose the type of claim.";
    if (!STATUSES.includes(s.status)) return "Choose where the claim is now.";
    if (s.insurer.trim().length < 2) return "Enter the insurer.";
    return "";
  }
  if (step === 2) {
    if (!s.docs.length) return "Tick the documents you have.";
    if (s.story.trim().length < 20) return "Describe what happened in a few sentences.";
    return "";
  }
  if (step === 3) {
    if (s.name.trim().length < 2) return "Enter your name.";
    if (!EMAIL_RE.test(s.email.trim())) return "Enter a valid email.";
    if (!ccs.includes(s.cc)) return "Choose a country code.";
    const d = s.phone.replace(/\D/g, "").length;
    if (d < 7 || d > 12) return "Enter the phone number without the country code.";
    if (!s.ack) return "Tick to confirm you understand what the review is.";
    if (!s.consent) return "Tick the consent box to send.";
    return "";
  }
  return "";
}
