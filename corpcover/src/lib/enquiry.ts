import { site } from "@/site";

export type SendResult = { ok: true } | { ok: false; fallback: string; message?: string };

/** Posts a form to /api/enquiry. When online sending is off or fails, returns a mailto link
 *  carrying the same details so the visitor can send it from their own email app. */
export async function sendEnquiry(form: FormData, subject: string): Promise<SendResult> {
  const body = [
    `Name: ${form.get("name") || ""}`, `Company: ${form.get("company") || ""}`,
    `Phone: ${form.get("phone") || ""}`, `Email: ${form.get("email") || ""}`, "", String(form.get("details") || ""),
  ].join("\n");
  const fallback = `mailto:${site.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  try {
    const res = await fetch("/api/enquiry", { method: "POST", body: form });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    const message = typeof data.error === "string" && !["not_configured", "send_failed"].includes(data.error) ? data.error : undefined;
    if (message && res.status !== 413) return { ok: false, fallback: "", message };
    return { ok: false, fallback, message };
  } catch {
    return { ok: false, fallback };
  }
}
