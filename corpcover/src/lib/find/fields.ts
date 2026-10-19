// Proposal field map: every field on the Chubb proposal forms, and which Find answer fills it.
// Server-side only (imported by the record builder in the API route), so the 125 KB map stays out of the page bundle.
import raw from "./fields.json";
import type { Answers } from "./questions";

/** [section, field id, label on the Chubb form, common key, conditional (1) or always asked (0)]. */
export type FieldRow = [string, string, string, string, number];
export type FormKey = keyof typeof raw;
export const FIELDS = raw as unknown as Record<FormKey, { title: string; rows: FieldRow[] }>;
export const isForm = (k: string): k is FormKey => Object.prototype.hasOwnProperty.call(FIELDS, k);

export type Source = "find" | "confirm" | "acra" | "adviser" | "sign" | "na";
export type FieldCounts = Record<Source, number>;
type Map = [string, Source?];

/** Common key -> [Find question, mode]. find = exact answer, confirm = range the adviser firms up. */
const CK: Record<string, Map> = {
  company_name: ["contact.company", "find"], contact_name: ["contact.name", "find"], contact_email: ["contact.email", "find"], contact_phone: ["contact.phone", "find"],
  industry: ["industry", "find"], business_description: ["industry", "confirm"], year_established: ["founded", "find"], website: ["contact.email", "confirm"],
  uen: ["acra"], company_address: ["acra"], legal_form: ["acra"],
  turnover_last_fy: ["revenue", "confirm"], turnover_by_territory: ["usca", "confirm"], us_canada_exposure: ["usca", "find"],
  employees_total: ["staff", "confirm"], employees_by_category: ["manual", "confirm"], wageroll_annual: ["wic_wages", "confirm"], wageroll_by_category: ["wic_wages", "confirm"],
  premises_owned_or_rented: ["premises", "find"], new_locations_count: ["locations", "confirm"], sum_insured_contents: ["sp_value", "confirm"], sum_insured_stock: ["sp_value", "confirm"],
  claims_history_5y: ["claims", "find"], circumstances_known: ["claims", "find"], previously_declined: ["declined", "find"],
  prior_insurance_current_insurer: ["insured", "confirm"], prior_insurance_expiry: ["renewal", "confirm"], period_of_insurance_start: ["renewal", "confirm"],
  listed_status: ["do_listed", "find"], new_mfa: ["cy_mfa", "find"], new_cyber_controls: ["cy_mfa", "confirm"], new_backup_frequency: ["cy_backup", "confirm"],
  new_sensitive_records_count: ["cy_records", "confirm"], export_countries: ["pl_us", "confirm"], declaration_signature: ["sign"],
};
/** Form field id -> [Find question, mode], for fields the extraction did not tag with a common key. */
const FID: Record<string, Map> = {
  tel_no: ["contact.phone", "find"], email: ["contact.email", "find"], contact_person: ["contact.name", "find"], ciso_name: ["contact.name", "confirm"],
  nature_of_business: ["industry", "confirm"], business_activities: ["industry", "confirm"], business_type: ["industry", "confirm"],
  years_in_operation: ["founded", "find"], years_in_business: ["founded", "find"], annual_turnover: ["revenue", "confirm"], annual_turnover_sgd: ["revenue", "confirm"],
  manual_employees: ["manual", "confirm"], nonmanual_below_threshold: ["manual", "confirm"], nonmanual_above_threshold: ["manual", "confirm"], wageroll_total: ["wic_wages", "confirm"],
  claims_5y: ["claims", "find"], claims_past_3y: ["claims", "find"], incidents_3y: ["claims", "find"], losses_3y: ["claims", "find"], prior_event_loss: ["claims", "find"],
  hazardous_works: ["gl_haz", "find"], height_max_avg: ["gl_haz", "confirm"], us_canada_20pct: ["usca", "confirm"],
  q1_mfa_remote: ["cy_mfa", "find"], q2_backups_protected: ["cy_backup", "confirm"], q5_pii_over_500k: ["cy_records", "find"], plan_selection: ["cy_limit", "confirm"],
  employees: ["staff", "confirm"], employees_to_insure: ["gpa_heads", "find"], regional_trips_per_year: ["tr_trips", "confirm"], intl_trips_per_year: ["tr_trips", "confirm"],
  territorial_limits: ["tr_where", "find"], existing_insurer: ["insured", "confirm"], signature: ["sign"], intermediary_signature: ["adviser"],
  period: ["renewal", "confirm"], period_start: ["renewal", "confirm"], event_revenue: ["ev_size", "confirm"],
};
const LIMIT_Q: Record<string, string> = { pi: "pi_limit", do: "do_limit", cy: "cy_limit" };
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function answered(a: Answers, id: string) {
  if (id.startsWith("contact.")) return !!String((a.contact as Record<string, unknown> | undefined)?.[id.slice(8)] ?? "").trim();
  const v = a[id];
  return v != null && v !== "" && v !== "unsure" && !(Array.isArray(v) && !v.length);
}

export function fieldSource(a: Answers, fk: string, row: FieldRow): Source {
  const [, id, , ck, cond] = row;
  let m: Map | null = (own(FID, id) ? FID[id] : undefined) ?? (own(CK, ck) ? CK[ck] : undefined) ?? null;
  if (ck === "limit_requested") { const q = LIMIT_Q[fk.split("_")[0]]; m = q ? [q, "confirm"] : null; }
  if (m && (m[0] === "acra" || m[0] === "sign" || m[0] === "adviser")) return m[0];
  if (m && m[1] && answered(a, m[0])) return m[1];
  return cond ? "na" : "adviser";
}

export function fieldCounts(a: Answers, fk: FormKey): FieldCounts {
  const c: FieldCounts = { find: 0, confirm: 0, acra: 0, adviser: 0, sign: 0, na: 0 };
  FIELDS[fk].rows.forEach(r => c[fieldSource(a, fk, r)]++);
  return c;
}
