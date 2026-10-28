import { site } from "@/site";

// Receives the contact forms and emails them to the New South Sea inbox through Resend.
// Dormant until RESEND_API_KEY and ENQUIRY_FROM are set: it answers 503 and the form shows the email address.

export const runtime = "nodejs";

const KINDS = ["review", "claim", "general"] as const;
const str = (v: FormDataEntryValue | null, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY, from = process.env.ENQUIRY_FROM, to = process.env.ENQUIRY_TO;
  if (!key || !from || !to) return Response.json({ error: "not_configured" }, { status: 503 });

  let form: FormData;
  try { form = await req.formData(); } catch { return Response.json({ error: "Could not read the form." }, { status: 400 }); }
  if (str(form.get("website"))) return Response.json({ ok: true }); // honeypot

  const kind = str(form.get("kind")) as (typeof KINDS)[number];
  const name = str(form.get("name"), 120), company = str(form.get("company"), 160), email = str(form.get("email"), 200);
  if (!KINDS.includes(kind)) return Response.json({ error: "Choose what the enquiry is about." }, { status: 400 });
  if (!name) return Response.json({ error: "Enter your name." }, { status: 400 });
  if (!company) return Response.json({ error: "Enter your company." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Enter a valid work email." }, { status: 400 });

  const lines = [
    `Enquiry: ${kind}`, `Name: ${name}`, `Role: ${str(form.get("role"), 120) || "-"}`, `Company: ${company}`,
    `Email: ${email}`, `Phone: ${str(form.get("phone"), 40) || "-"}`, `Renewal month: ${str(form.get("renewal"), 40) || "-"}`,
    "", str(form.get("message"), 4000),
  ];

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], reply_to: email, subject: `${site.domain}: ${kind} from ${company}`, text: lines.join("\n") }),
  });
  if (!res.ok) {
    console.error("enquiry: resend failed", res.status, await res.text().catch(() => ""));
    return Response.json({ error: "send_failed" }, { status: 502 });
  }
  return Response.json({ ok: true });
}
