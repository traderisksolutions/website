import type { Metadata } from "next";
import Link from "next/link";
import { SLA_HOURS } from "@/lib/claim";
import { marketParam, mpath } from "@/lib/market";

export const metadata: Metadata = { title: "Payment received", robots: { index: false, follow: false } };

// Stripe Payment Links redirect here after payment ("After payment" → /{market}/claims/paid).
export default async function Paid({ params }: { params: Promise<{ market: string }> }) {
  const m = await marketParam(params);
  return (
    <main className="wrap flex-1 py-[clamp(72px,10vw,140px)]">
      <h1 className="t-h1 max-w-[14ch]">Payment received</h1>
      <ol className="mt-10 grid max-w-[56ch] gap-5 text-[18px] text-ink-2">
        <li><b className="text-ink">1. Check your inbox.</b> Stripe sends the receipt. We email you from Corp Cover to start the thread.</li>
        <li><b className="text-ink">2. Reply with the documents.</b> The policy schedule, the wording and the insurer&apos;s letter.</li>
        <li><b className="text-ink">3. PDF report within {SLA_HOURS} hours</b> of receiving the documents, in the same thread.</li>
        <li><b className="text-ink">4. A broker follows up</b> in the same thread to go through it with you.</li>
      </ol>
      <Link href={mpath(m, "/articles?topic=Claims")} className="btn btn-ghost mt-10">Read the claim guides</Link>
    </main>
  );
}
