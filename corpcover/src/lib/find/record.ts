// Find my cover: flags, Chubb table premiums, forms chosen and the record sent to the TRS dashboard.
// Logic ported from the find-routing prototype. Runs on the server (src/app/api/find/route.ts).
import { fieldCounts, isForm, type FieldCounts, type FormKey } from "./fields";
import {
  CC, DO_EXCL, EMAIL_RE, P, Q, SEVEN, TIMES, TZ, has, isProduct, s, workingDays,
  type Answers, type Contact, type ProductKey,
} from "./questions";

export type Status = "partial" | "submitted";
export type IntakeRecord = {
  id: string;
  site: "corpcover";
  kind: "find";
  status: Status;
  source_url: string | null;
  client: { company_name: string | null; contact_name: string | null; email: string | null; phone: string | null; industry: string | null };
  answers: Record<string, unknown>;
  product_requests: { product: ProductKey; chubb_form: string; chubb_table_premium: number | null }[];
  flags: string[];
  proposal_fields: Record<string, FieldCounts>;
  documents: { kind: string; name: string; bytes: number }[];
  booking: { day: string; time: string; format: "meet" | "whatsapp"; tz: typeof TZ } | null;
  consent_pdpa: boolean;
};

export function flags(a: Answers): string[] {
  const f: string[] = [];
  if (s(a, "claims") === "yes") f.push("claims_history");
  if (s(a, "usca") === "yes" || s(a, "pl_us") === "yes") f.push("us_exposure");
  if (s(a, "revenue") === "rmore") f.push("above_sme_plans");
  if (s(a, "declined") === "yes") f.push("prior_decline");
  if (SEVEN.includes(s(a, "industry") ?? "") && (s(a, "staff") === "more" || s(a, "locations") === "6+" || s(a, "sp_value") === "more")) f.push("select_plus_commercial");
  if (s(a, "gl_haz") === "yes") f.push("hazardous_work");
  if (has(a, "cyber") && (["no", "partly"].includes(s(a, "cy_mfa") ?? "") || s(a, "cy_backup") === "no")) f.push("cyber_controls");
  if (has(a, "do") && s(a, "do_listed") && s(a, "do_listed") !== "no") f.push("listed_do");
  return f;
}

// Chubb table premiums (SGD, before GST), kept for the adviser only. Never shown to the buyer.
const DO_T: Record<string, number[]> = { "500k": [1100, 1400, 1600], "1m": [1400, 1600, 2100], "2m": [2500, 3100, 3500], "3m": [3200, 3900, 4600], "5m": [4400, 5300, 6400] };
const CY_T: Record<string, number[]> = { r1: [500, 700, 1000, 2200, 2750], r10: [1100, 1400, 1800, 2950, 3700], r25: [1500, 1750, 3200, 4800, 6600], r50: [2950, 3500, 4200, 6350, 8800] };
const CY_L = ["250k", "500k", "1m", "2m", "3m"];
const own = (o: object, k?: string) => k != null && Object.prototype.hasOwnProperty.call(o, k);

export function tablePremium(a: Answers, k: string): number | null {
  const doLimit = s(a, "do_limit"), revenue = s(a, "revenue"), cyLimit = s(a, "cy_limit");
  if (k === "do" && own(DO_T, doLimit) && !DO_EXCL.includes(s(a, "industry") ?? "") && s(a, "usca") !== "yes" && s(a, "claims") !== "yes" && s(a, "do_listed") === "no") {
    const col = ({ r1: 0, r10: 0, r25: 1, r50: 2 } as Record<string, number>)[revenue ?? ""];
    return col == null ? null : DO_T[doLimit!][col];
  }
  if (k === "cyber" && own(CY_T, revenue) && CY_L.includes(cyLimit ?? "") && s(a, "industry") !== "education" && s(a, "claims") !== "yes")
    return CY_T[revenue!][CY_L.indexOf(cyLimit!)];
  return null;
}

export function formsChosen(a: Answers): FormKey[] {
  const out: string[] = [], flg = flags(a);
  const industry = s(a, "industry") ?? "", svc = s(a, "pi_service");
  (a.needs || []).forEach(k => {
    if (k === "select") out.push(SEVEN.includes(industry) && !flg.includes("select_plus_commercial") ? "select7" : "selectc");
    else if (k === "pi") out.push(svc === "accounting" ? (s(a, "pi_fees") !== "more" && s(a, "claims") !== "yes" ? "pi_accsme" : "pi_acc")
      : ({ legal: "pi_law", design: "pi_con", realestate: "pi_re", it: "pi_it", media: "pi_media" } as Record<string, string>)[svc ?? ""] || "pi_misc");
    else if (k === "do") out.push(tablePremium(a, "do") != null || (!s(a, "do_limit") && s(a, "usca") !== "yes" && s(a, "claims") !== "yes" && !DO_EXCL.includes(industry) && s(a, "revenue") !== "rmore") ? "do_pre" : "do_elite");
    else if (k === "cyber") out.push(s(a, "revenue") !== "rmore" && industry !== "education" && s(a, "claims") !== "yes" ? "cy_sme" : "cy_short");
    else if (isForm(k)) out.push(k);
  });
  return out.filter(isForm);
}

/** The record the dashboard stores. `answers` holds every answer except contact, slot and upload, which have their own fields. */
export function buildRecord(id: string, status: Status, sourceUrl: string | null, a: Answers): IntakeRecord {
  const c = a.contact || {}, answers: Record<string, unknown> = {};
  Object.keys(a).forEach(k => { if (!["contact", "slot", "upload"].includes(k)) answers[k] = a[k]; });
  const digits = (c.phone || "").replace(/\D/g, "");
  const format = s(a, "format");
  return {
    id, site: "corpcover", kind: "find", status, source_url: sourceUrl,
    client: {
      company_name: c.company?.trim() || null, contact_name: c.name?.trim() || null, email: c.email?.trim() || null,
      phone: digits ? `${c.cc || "+65"} ${digits}` : null, industry: s(a, "industry") ?? null,
    },
    answers,
    product_requests: (a.needs || []).filter(isProduct).map(k => ({ product: k, chubb_form: P[k].form, chubb_table_premium: tablePremium(a, k) })),
    flags: flags(a),
    proposal_fields: Object.fromEntries(formsChosen(a).map(fk => [fk, fieldCounts(a, fk)])),
    documents: a.upload ? [{ kind: "current_policy", name: a.upload.name, bytes: a.upload.size }] : [],
    booking: a.slot && (format === "meet" || format === "whatsapp") ? { day: a.slot.day, time: a.slot.time, format, tz: TZ } : null,
    consent_pdpa: !!c.consent,
  };
}

/* ── Input sanitising: keep only known question ids and the values each question allows ── */

const cap = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Rebuilds answers from untrusted input. Unknown keys and out-of-range values are dropped. */
export function sanitizeAnswers(input: unknown): Answers {
  const src = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const a: Answers = {};
  for (const q of Q) {
    const v = src[q.id];
    if (v == null) continue;
    const allowed = q.opts?.map(o => o.v);
    switch (q.type) {
      case "choice": case "scale":
        if (typeof v === "string" && allowed?.includes(v)) a[q.id] = v;
        break;
      case "multi":
        if (Array.isArray(v)) a[q.id] = [...new Set(v.filter((x): x is string => typeof x === "string" && !!allowed?.includes(x)))];
        break;
      case "text": { const t = cap(v, 300); if (t !== undefined) a[q.id] = t; break; }
      case "long": { const t = cap(v, 4000); if (t !== undefined) a[q.id] = t; break; }
      case "number": { const t = cap(v, 12); if (t !== undefined) a[q.id] = t.replace(/[^\d.]/g, ""); break; }
      case "upload": {
        const u = v as { name?: unknown; size?: unknown };
        if (typeof u === "object" && typeof u.name === "string" && typeof u.size === "number" && Number.isFinite(u.size) && u.size >= 0)
          a.upload = { name: u.name.slice(0, 200), size: Math.round(u.size) };
        break;
      }
      case "contact": {
        const c = v as Record<string, unknown>;
        if (typeof c !== "object") break;
        const out: Contact = {
          name: cap(c.name, 120), company: cap(c.company, 160), email: cap(c.email, 200), phone: cap(c.phone, 30),
          cc: CC.some(x => x[1] === c.cc) ? (c.cc as string) : undefined, consent: c.consent === true,
        };
        a.contact = out;
        break;
      }
      case "booking": {
        const b = v as { day?: unknown; time?: unknown };
        if (typeof b === "object" && typeof b.day === "string" && DAY_RE.test(b.day) && typeof b.time === "string" && TIMES.includes(b.time))
          a.slot = { day: b.day, time: b.time };
        break;
      }
    }
  }
  return a;
}

/** Checks a submitted record carries what the adviser needs. Returns an error message, or "". */
export function checkSubmitted(a: Answers): string {
  const c = a.contact || {};
  if (!s(a, "industry")) return "industry missing";
  if (!c.name?.trim() || !c.company?.trim()) return "contact missing";
  if (!EMAIL_RE.test(c.email || "")) return "email invalid";
  if (!c.consent) return "consent missing";
  if (!a.slot || !workingDays().concat(workingDays(new Date(Date.now() - 86400000))).includes(a.slot.day)) return "time missing";
  if (s(a, "format") !== "meet" && s(a, "format") !== "whatsapp") return "format missing";
  return "";
}
