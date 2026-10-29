import { site } from "@/site";

// Receives the contact form (JSON) and emails it to the New South Sea inbox through Resend.
// Dormant until RESEND_API_KEY, ENQUIRY_FROM and ENQUIRY_TO are set: it answers 503 and the form shows the email address.

export const runtime = "nodejs";

type Body = Record<string, unknown>;
const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown) => (Array.isArray(v) ? v.filter(x => typeof x === "string").map(x => (x as string).slice(0, 80)).slice(0, 20) : []);

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY, from = process.env.ENQUIRY_FROM, to = process.env.ENQUIRY_TO;
  if (!key || !from || !to) return Response.json({ error: "not_configured" }, { status: 503 });

  let b: Body;
  try { b = (await req.json()) as Body; } catch { return Response.json({ error: "Could not read the form." }, { status: 400 }); }
  if (str(b.website)) return Response.json({ ok: true }); // honeypot

  const purpose = str(b.purpose, 60), company = str(b.company, 160), name = str(b.name, 120), email = str(b.email, 200);
  if (!purpose) return Response.json({ error: "Choose what the enquiry is about." }, { status: 400 });
  if (!company) return Response.json({ error: "Enter the company name." }, { status: 400 });
  if (!name) return Response.json({ error: "Enter your name." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Enter a valid email." }, { status: 400 });
  if (b.consent !== true) return Response.json({ error: "Tick the consent box." }, { status: 400 });

  const ref = `NSS-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const lines = [
    `Reference: ${ref}`, `Purpose: ${purpose}`, `Urgency: ${str(b.urgency, 60) || "-"}`, "",
    `Company: ${company}`, `Industry: ${str(b.industry, 80) || "-"}`, `Revenue: ${str(b.revenue, 40) || "-"}`, `Territories: ${str(b.territories, 200) || "-"}`,
    `Operations: ${str(b.operations, 2000) || "-"}`, "",
    `Lines: ${list(b.lines).join(", ") || "-"}`, `Renewal date: ${str(b.date, 20) || "-"}`, `Incumbent: ${str(b.incumbent, 120) || "-"}`, "",
    `Name: ${name}`, `Title: ${str(b.title, 120) || "-"}`, `Email: ${email}`, `Phone: ${str(b.dial, 6)} ${str(b.phone, 40) || "-"}`, `Heard from: ${str(b.heard, 80) || "-"}`, "",
    `Note: ${str(b.note, 2000) || "-"}`,
  ];

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], reply_to: email, subject: `${site.domain}: ${purpose} from ${company} (${ref})`, text: lines.join("\n") }),
  });
  if (!res.ok) {
    console.error("enquiry: resend failed", res.status, await res.text().catch(() => ""));
    return Response.json({ error: "send_failed" }, { status: 502 });
  }
  return Response.json({ ok: true, ref });
}
