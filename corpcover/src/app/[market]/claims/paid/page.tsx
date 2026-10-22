import type { Metadata } from "next";
import { ClaimFlow } from "@/components/claim-flow";
import { SLA_HOURS } from "@/lib/claim";
import { marketParam } from "@/lib/market";

export const metadata: Metadata = { title: "Payment received", robots: { index: false, follow: false } };

// Stripe Payment Links redirect here after payment ("After payment" → /{market}/claims/paid).
export default async function Paid({ params }: { params: Promise<{ market: string }> }) {
  const m = await marketParam(params);
  return (
    <main className="wrap flex-1 py-[clamp(72px,10vw,144px)]">
      <div className="mx-auto max-w-[720px]">
        <p className="text-[14px] font-medium text-accent">Payment received</p>
        <h1 className="t-h1 mt-4">Now tell us about the claim</h1>
        <p className="t-lede mt-7">Stripe has emailed your receipt. Answer a few questions, then reply to our email with the documents. Your PDF report arrives within {SLA_HOURS} hours of receiving them, and a broker follows up in the same thread.</p>
        <div className="mt-[clamp(48px,6vw,80px)]"><ClaimFlow market={m} mode="details" /></div>
      </div>
    </main>
  );
}
