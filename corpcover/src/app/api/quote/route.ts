import { CC } from "@/lib/find/questions";
import { COVERS, EMAIL_RE, ROLES, UEN_RE } from "@/lib/quote";

// The home page quote request. Validates, then forwards to the TRS dashboard (Sales > Enquiries)
// as kind "enquiry". Dormant until TRS_INTAKE_URL and TRS_INTAKE_KEY are set: it answers 503.
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WINDOW = 10 * 60 * 1000, LIMIT = 20;
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), list = (hits.get(ip) ?? []).filter(t => now - t < WINDOW);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < WINDOW)) hits.delete(k);
  return list.length > LIMIT;
}
const json = (body: unknown, status = 200) => Response.json(body, { status });
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  const url = process.env.TRS_INTAKE_URL, key = process.env.TRS_INTAKE_KEY;
  if (!url || !key) return json({ error: "not configured" }, 503);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (limited(ip)) return json({ error: "too many requests" }, 429);
  const text = await req.text();
  if (text.length > 10_000) return json({ error: "too large" }, 413);
  let b: Record<string, unknown>;
  try { b = JSON.parse(text); } catch { return json({ error: "bad request" }, 400); }
  if (str(b.website, 200)) return json({ ok: true }); // honeypot

  const id = str(b.id, 40), company = str(b.company, 160), uen = str(b.uen, 12).toUpperCase();
  const cover = Array.isArray(b.cover) ? b.cover.filter((c): c is string => typeof c === "string" && COVERS.includes(c)).slice(0, 13) : [];
  const firstName = str(b.firstName, 80), lastName = str(b.lastName, 80), role = str(b.role, 40);
  const email = str(b.email, 200).toLowerCase(), cc = str(b.cc, 6), phone = str(b.phone, 24).replace(/[^\d ]/g, "");
  const neededBy = str(b.neededBy, 10), details = str(b.details, 2000), sourceUrl = str(b.sourceUrl, 500);
  if (!UUID_RE.test(id)) return json({ error: "invalid id" }, 400);
  if (company.length < 2) return json({ error: "Enter the company name." }, 400);
  if (uen && !UEN_RE.test(uen)) return json({ error: "UEN is 9 or 10 letters and digits." }, 400);
  if (!firstName || !lastName) return json({ error: "Enter your first and last name." }, 400);
  if (!ROLES.includes(role)) return json({ error: "Choose your role." }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: "Enter a valid work email." }, 400);
  if (!CC.some(c => c[1] === cc)) return json({ error: "Choose a country code." }, 400);
  const digits = phone.replace(/\D/g, "").length;
  if (digits < 7 || digits > 12) return json({ error: "Enter the phone number without the country code." }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(neededBy)) return json({ error: "Choose a date." }, 400);
  if (b.consent !== true) return json({ error: "Tick the consent box to send." }, 400);

  const body = {
    id, site: "corpcover", kind: "enquiry", status: "submitted", source_url: sourceUrl || null,
    client: { company_name: company, contact_name: `${firstName} ${lastName}`, email, phone: `${cc} ${phone.replace(/\s+/g, "")}`, industry: null },
    answers: { form: "quote-v1", uen: uen || null, cover, role, needed_by: neededBy, details: details || null },
    product_requests: cover.map(c => ({ product: c })),
    flags: [], proposal_fields: {}, documents: [], booking: null, consent_pdpa: true,
  };
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "x-forwarded-user-agent": req.headers.get("user-agent") ?? "" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return json({ error: "Could not send." }, 502);
    return json({ ok: true });
  } catch { return json({ error: "Could not send." }, 502); }
}
