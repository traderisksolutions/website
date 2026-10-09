import Anthropic from "@anthropic-ai/sdk";
import { systemPrompt } from "@/lib/chat-knowledge";

// The chat on the FAQ and in the Start modal. Streams Claude's reply as plain text.
// Dormant until ANTHROPIC_API_KEY is set: it answers 503 and the page answers from the FAQ.

export const runtime = "nodejs";

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const MAX_TURNS = 20;
const MAX_CHARS = 1000;
const LIMIT = 20;                 // messages per visitor
const WINDOW_MS = 10 * 60 * 1000; // per 10 minutes, per server instance
const hits = new Map<string, number[]>();

function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > LIMIT;
}

type Turn = { role: "user" | "assistant"; text: string };

/** Alternating turns ending with the visitor, each non-empty and bounded. */
function parse(body: unknown): Anthropic.Beta.BetaMessageParam[] | null {
  const turns = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(turns) || turns.length === 0 || turns.length > MAX_TURNS) return null;
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const [i, t] of (turns as Turn[]).entries()) {
    const role = i % 2 === turns.length % 2 ? "assistant" : "user";
    if (t?.role !== role || typeof t.text !== "string") return null;
    const text = t.text.trim().slice(0, MAX_CHARS);
    if (!text) return null;
    out.push({ role, content: text });
  }
  return out[0].role === "user" && out.at(-1)?.role === "user" ? out : null;
}

export async function POST(req: Request) {
  if (!client) return Response.json({ error: "not_configured" }, { status: 503 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(ip)) return Response.json({ error: "rate_limited" }, { status: 429 });

  const messages = parse(await req.json().catch(() => null));
  if (!messages) return Response.json({ error: "bad_request" }, { status: 400 });

  const stream = client.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 4096,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages,
  }, { signal: req.signal });

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sent = false;
      stream.on("text", t => { sent = true; controller.enqueue(enc.encode(t)); });
      try {
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") controller.enqueue(enc.encode(`${sent ? "\n\n" : ""}An adviser can help with this one. Use WhatsApp or request a callback below.`));
      } catch (err) {
        if (err instanceof Anthropic.APIUserAbortError) { controller.close(); return; }
        console.error("chat: stream failed", err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err);
        // Nothing sent yet: the page falls back to its own answer. Part-way: end the reply plainly.
        controller.enqueue(enc.encode(sent ? "\n\nThe reply was cut off. An adviser can pick it up below." : "\u0000"));
      }
      controller.close();
    },
    cancel() { stream.abort(); },
  });

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
