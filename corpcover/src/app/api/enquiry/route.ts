import { site } from "@/site";

// Receives the three enquiry forms (policy review, cover finder, callback) and emails them to
// the Corporate Cover inbox through Resend. Dormant until RESEND_API_KEY and ENQUIRY_FROM are
// set: it answers 503 and the page falls back to the visitor's own email app.

export const runtime = "nodejs";

const KINDS = ["policy-review", "cover-finder", "callback"] as const;
const MAX_FILE = 4 * 1024 * 1024; // Vercel functions accept ~4.5 MB request bodies
const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/heic"];

const str = (v: FormDataEntryValue | null, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY, from = process.env.ENQUIRY_FROM;
  const to = process.env.ENQUIRY_TO || site.email;
  if (!key || !from) return Response.json({ error: "not_configured" }, { status: 503 });

  let form: FormData;
  try { form = await req.formData(); } catch { return Response.json({ error: "bad_request" }, { status: 400 }); }

  if (str(form.get("website"))) return Response.json({ ok: true }); // honeypot: bots fill every field

  const kind = str(form.get("kind")) as (typeof KINDS)[number];
  const name = str(form.get("name"), 120), phone = str(form.get("phone"), 40), email = str(form.get("email"), 200);
  if (!KINDS.includes(kind)) return Response.json({ error: "Unknown form." }, { status: 400 });
  if (!name) return Response.json({ error: "Enter your name." }, { status: 400 });
  if (!phone && !email) return Response.json({ error: "Enter a phone number or an email address." }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Check the email address." }, { status: 400 });

  const attachments: { filename: string; content: string }[] = [];
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE) return Response.json({ error: "The file is over 4 MB. Email it instead." }, { status: 413 });
    if (!FILE_TYPES.includes(file.type)) return Response.json({ error: "Upload a PDF, JPG or PNG." }, { status: 415 });
    attachments.push({ filename: file.name.slice(0, 120), content: Buffer.from(await file.arrayBuffer()).toString("base64") });
  }
  if (kind === "policy-review" && !attachments.length) return Response.json({ error: "Attach the policy." }, { status: 400 });

  const lines = [
    `Form: ${kind}`, `Name: ${name}`, `Company: ${str(form.get("company"), 160) || "-"}`,
    `Phone: ${phone || "-"}`, `Email: ${email || "-"}`,
    ...str(form.get("details"), 4000).split("\n").filter(Boolean),
  ];

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [to], subject: `${site.domain}: ${kind} from ${name}`,
      text: lines.join("\n"), ...(email ? { reply_to: email } : {}), attachments,
    }),
  });
  if (!res.ok) {
    console.error("enquiry: resend failed", res.status, await res.text().catch(() => ""));
    return Response.json({ error: "send_failed" }, { status: 502 });
  }
  return Response.json({ ok: true });
}
