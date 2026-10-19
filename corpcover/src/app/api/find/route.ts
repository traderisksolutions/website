import { buildRecord, checkSubmitted, sanitizeAnswers, type Status } from "@/lib/find/record";
import { EMAIL_RE } from "@/lib/find/questions";

// Receives Find my cover answers from the start modal, builds the intake record on the server
// (flags, Chubb forms, table premiums, proposal field counts) and forwards it to the TRS dashboard.
// Dormant until TRS_INTAKE_URL and TRS_INTAKE_KEY are set: it answers 503.

export const runtime = "nodejs";

const MAX_BODY = 200 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Per-IP limit: 60 requests per 10 minutes. In memory, so per instance; enough to stop a loop or a bot.
const WINDOW = 10 * 60 * 1000, LIMIT = 60;
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), list = (hits.get(ip) ?? []).filter(t => now - t < WINDOW);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < WINDOW)) hits.delete(k);
  return list.length > LIMIT;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(req: Request) {
  const url = process.env.TRS_INTAKE_URL, key = process.env.TRS_INTAKE_KEY;
  if (!url || !key) return json({ error: "intake not configured" }, 503);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  if (limited(ip)) return json({ error: "too many requests" }, 429);

  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY) return json({ error: "body too large" }, 413);
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY) return json({ error: "body too large" }, 413);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch { return json({ error: "bad request" }, 400); }

  const id = body.id;
  if (typeof id !== "string" || !UUID_RE.test(id)) return json({ error: "invalid id" }, 400);
  const status = body.status as Status;
  if (status !== "partial" && status !== "submitted") return json({ error: "invalid status" }, 400);
  if (body.site != null && body.site !== "corpcover") return json({ error: "invalid site" }, 400);
  const src = typeof body.source_url === "string" && /^https?:\/\//.test(body.source_url) ? body.source_url.slice(0, 500) : null;

  const answers = sanitizeAnswers(body.answers);
  if (!answers.industry) return json({ error: "industry missing" }, 400);
  const email = answers.contact?.email?.trim();
  if (email && !EMAIL_RE.test(email)) {
    if (status === "submitted") return json({ error: "email invalid" }, 400);
    answers.contact!.email = undefined; // mid-typing on a partial save: drop it, keep the rest
  }
  if (status === "submitted") {
    const problem = checkSubmitted(answers);
    if (problem) return json({ error: problem }, 400);
  }

  const record = buildRecord(id, status, src, answers);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("find: intake rejected", res.status, (await res.text().catch(() => "")).slice(0, 500));
      return json({ error: "intake failed" }, 502);
    }
  } catch (e) {
    console.error("find: intake unreachable", e);
    return json({ error: "intake unreachable" }, 502);
  }
  return json({ ok: true });
}
