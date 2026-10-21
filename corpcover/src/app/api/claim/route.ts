import { CC } from "@/lib/find/questions";
import { CLAIM_TYPES, DOCS, EMPTY_CLAIM, PLANS, STATUSES, claimStepError, type ClaimState, type Plan } from "@/lib/claim";
import { MARKETS, isMarket } from "@/lib/market";

// Claim second opinion requests. Validated again here, then sent to the TRS dashboard
// (Sales > Enquiries, form "claim-v1"). Payment and document upload links follow by email until
// Stripe and storage are connected. Dormant until TRS_INTAKE_URL and TRS_INTAKE_KEY are set: 503.
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
  if (text.length > 16_000) return json({ error: "too large" }, 413);
  let b: Record<string, unknown>;
  try { b = JSON.parse(text); } catch { return json({ error: "bad request" }, 400); }
  if (str(b.website, 200)) return json({ ok: true });
  const id = str(b.id, 40);
  if (!UUID_RE.test(id)) return json({ error: "invalid id" }, 400);
  const plan = (b.plan === "personal" || b.plan === "business" ? b.plan : "") as Plan | "";
  const s: ClaimState = {
    ...EMPTY_CLAIM, plan, type: str(b.type, 60), status: str(b.status, 40), insurer: str(b.insurer, 120), amount: str(b.amount, 40),
    decisionDate: str(b.decisionDate, 10), docs: Array.isArray(b.docs) ? b.docs.filter((d): d is string => typeof d === "string" && DOCS.includes(d)) : [],
    story: str(b.story, 4000), name: str(b.name, 120), email: str(b.email, 200).toLowerCase(), cc: str(b.cc, 6),
    phone: str(b.phone, 24).replace(/[^\d ]/g, ""), consent: b.consent === true, ack: b.ack === true,
  };
  const ccs = CC.map(c => c[1]);
  for (let step = 0; step <= 3; step++) { const e = claimStepError(step, s, ccs); if (e) return json({ error: e }, 400); }
  if (!plan || !CLAIM_TYPES[plan].includes(s.type) || !STATUSES.includes(s.status)) return json({ error: "bad request" }, 400);
  const market = isMarket(b.market) ? b.market : "sg";
  const body = {
    id, site: "corpcover", kind: "enquiry", status: "submitted", source_url: str(b.sourceUrl, 500) || null,
    client: { company_name: plan === "business" ? `${s.name} (business claim)` : `${s.name} (personal claim)`, contact_name: s.name, email: s.email, phone: `${s.cc} ${s.phone.replace(/\s+/g, "")}`, industry: null },
    answers: {
      form: "claim-v1", market: MARKETS[market].code, plan: PLANS[plan].label, price: PLANS[plan].price, claim_type: s.type, claim_status: s.status,
      insurer: s.insurer, amount_claimed: s.amount || null, decision_date: s.decisionDate || null, documents_held: s.docs, what_happened: s.story,
    },
    product_requests: [{ product: `Claim second opinion: ${s.type}` }],
    flags: ["claim_second_opinion"], proposal_fields: {}, documents: [], booking: null, consent_pdpa: true,
  };
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "x-forwarded-user-agent": req.headers.get("user-agent") ?? "" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return json({ error: "Could not send." }, 502);
    return json({ ok: true });
  } catch { return json({ error: "Could not send." }, 502); }
}
