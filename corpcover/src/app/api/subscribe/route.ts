// Newsletter sign-up. Validates the address and forwards it to the TRS dashboard, which owns the
// subscriber list, the confirmation email and sending. Dormant until TRS_INTAKE_KEY is set: it
// answers 503 and the form shows its error state.

export const runtime = "nodejs";

const MAX_BODY = 5 * 1024;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 10;

// Per-instance only: good enough to slow a script, not a global quota.
const hits = new Map<string, number[]>();

function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every(t => now - t >= WINDOW_MS)) hits.delete(k);
  return recent.length > LIMIT;
}

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (limited(ip)) return bad("Too many attempts. Try again later.", 429);

  const raw = await req.text().catch(() => "");
  if (new TextEncoder().encode(raw).length > MAX_BODY) return bad("Request too large.", 413);

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return bad("Invalid request."); }
  if (!body || typeof body !== "object") return bad("Invalid request.");
  const { email: e, source_url: s, company_website: trap } = body as Record<string, unknown>;

  if (typeof trap === "string" && trap.trim()) return Response.json({ ok: true }); // honeypot

  const email = typeof e === "string" ? e.trim() : "";
  if (!email || email.length > 200 || !EMAIL.test(email)) return bad("Enter a valid email address.");
  const source_url = typeof s === "string" ? s.slice(0, 500) : "";

  const key = process.env.TRS_INTAKE_KEY;
  if (!key) return bad("not_configured", 503);
  const base = (process.env.TRS_DASHBOARD_URL ?? "https://app.traderisksolutions.com.sg").replace(/\/+$/, "");

  let res: Response;
  try {
    res = await fetch(`${base}/api/public/newsletter/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({ site: "corpcover", email, source_url }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch (err) {
    console.error("subscribe: dashboard unreachable", err instanceof Error ? err.name : "error");
    return bad("upstream_failed", 502);
  }

  if (res.ok) return Response.json({ ok: true });
  if (res.status === 422) {
    const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
    return bad(typeof data?.error === "string" ? data.error.slice(0, 200) : "Enter a valid email address.");
  }
  console.error("subscribe: dashboard returned", res.status);
  return bad("upstream_failed", 502);
}
