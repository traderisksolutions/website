import { CC } from "@/lib/find/questions";
import { BIZ_BY_ID, COVERS, EMPTY, EXTRA_Q, FORMATS, NOT_SURE, stepError, type QuoteState } from "@/lib/quote";
import { MARKETS, isMarket } from "@/lib/market";

// Get covered: validates every step again on the server, then forwards to the TRS dashboard
// (Sales > Enquiries) as kind "enquiry". Dormant until TRS_INTAKE_URL and TRS_INTAKE_KEY are set: 503.
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
  if (text.length > 12_000) return json({ error: "too large" }, 413);
  let b: Record<string, unknown>;
  try { b = JSON.parse(text); } catch { return json({ error: "bad request" }, 400); }
  if (str(b.website, 200)) return json({ ok: true }); // honeypot

  const id = str(b.id, 40);
  if (!UUID_RE.test(id)) return json({ error: "invalid id" }, 400);
  const covers = Array.isArray(b.covers) ? b.covers.filter((c): c is string => typeof c === "string" && (COVERS.includes(c) || c === NOT_SURE)).slice(0, 14) : [];
  const s: QuoteState = {
    ...EMPTY,
    biz: str(b.biz, 40), covers, company: str(b.company, 160), uen: str(b.uen, 20).toUpperCase(), headcount: str(b.headcount, 20),
    neededBy: str(b.neededBy, 10), claims: str(b.claims, 3), contract: str(b.contract, 1000),
    firstName: str(b.firstName, 80), lastName: str(b.lastName, 80), role: str(b.role, 40), email: str(b.email, 200).toLowerCase(),
    cc: str(b.cc, 6), phone: str(b.phone, 24).replace(/[^\d ]/g, ""),
    format: str(b.format, 12), day: str(b.day, 10), slot: str(b.slot, 12), notes: str(b.notes, 2000), consent: b.consent === true,
    extra: Object.fromEntries(EXTRA_Q.map(q => [q.id, str((b.extra as Record<string, unknown> | undefined)?.[q.id], 120)]).filter(([, v]) => v)),
  };
  // The lead is saved when contact details are in (stage "contact"), then updated with the rest ("final").
  const final = b.stage !== "contact";
  const market = isMarket(b.market) ? b.market : "sg";
  const ccs = CC.map(c => c[1]);
  for (let step = 0; step <= (final ? 4 : 1); step++) { const e = stepError(step, s, ccs, market); if (e) return json({ error: e }, 400); }

  const biz = BIZ_BY_ID[s.biz];
  const body = {
    id, site: "corpcover", kind: "enquiry", status: "submitted", source_url: str(b.sourceUrl, 500) || null,
    client: { company_name: s.company, contact_name: `${s.firstName} ${s.lastName}`, email: s.email, phone: `${s.cc} ${s.phone.replace(/\s+/g, "")}`, industry: biz.label },
    answers: {
      form: "get-covered-v1", market: MARKETS[market].code, business_type: biz.label, business_group: biz.group, registration_no: s.uen || null, headcount: s.headcount,
      needed_by: s.neededBy || null, claims_5y: s.claims || null, contract_requirement: s.contract || null, role: s.role,
      call_format: FORMATS.find(f => f[0] === s.format)?.[1] ?? null, call_day: s.day || null, call_slot: s.slot || null, notes: s.notes || null,
      common_for_type: biz.c, stage: final ? "complete" : "contact only",
      cover_questions: Object.fromEntries(EXTRA_Q.filter(q => s.extra[q.id]).map(q => [q.label, s.extra[q.id]])),
    },
    product_requests: covers.map(c => ({ product: c })),
    flags: [...(s.claims === "yes" ? ["claims_history"] : []), ...(final ? [] : ["details_pending"])], proposal_fields: {}, documents: [],
    booking: !final ? null : { day: s.day, time: s.slot, format: s.format, tz: market === "hk" ? "Asia/Hong_Kong" : market === "my" ? "Asia/Kuala_Lumpur" : "Asia/Singapore", preferred: true },
    consent_pdpa: true,
  };
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "x-forwarded-user-agent": req.headers.get("user-agent") ?? "" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return json({ error: "Could not send." }, 502);
    return json({ ok: true });
  } catch { return json({ error: "Could not send." }, 502); }
}
