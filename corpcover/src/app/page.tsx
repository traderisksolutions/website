import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MARKETS, MARKET_KEYS, mpath, type MarketKey } from "@/lib/market";

// corpcover.com/: the market picker. It suggests a market from the visitor's country but never
// redirects there, so search engines and people can reach every market. Old ?start= links
// (newsletter emails) go on to the Singapore home with the parameter kept.
export const metadata: Metadata = {
  title: { absolute: "Corp Cover | Business insurance in Singapore, Malaysia and Hong Kong" },
  description: "Liability and asset insurance for companies in Singapore, Malaysia and Hong Kong. Plain guides, policy reviews and independent advisers who compare insurers. No fee.",
  alternates: { canonical: "/", languages: { ...Object.fromEntries(MARKET_KEYS.map(k => [MARKETS[k].lang, mpath(k)])), "x-default": "/" } },
};

const COUNTRY: Record<string, MarketKey> = { SG: "sg", MY: "my", HK: "hk" };
const LINE: Record<MarketKey, string> = {
  sg: "Work injury compensation, public liability, property and professional indemnity for Singapore companies.",
  my: "SOCSO and foreign worker cover, public liability, fire and professional indemnity for Malaysian companies.",
  hk: "Employees' compensation, public liability, office and shop cover for Hong Kong companies.",
};

export default async function Picker({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  if (sp.start) {
    const q = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map(x => [k, x]) : v ? [[k, v]] : [])) as [string, string][]);
    redirect(`/sg?${q}`);
  }
  const suggested = COUNTRY[(await headers()).get("x-vercel-ip-country") ?? ""] ?? null;
  const order = suggested ? [suggested, ...MARKET_KEYS.filter(k => k !== suggested)] : MARKET_KEYS;
  return (
    <main className="flex-1">
      <section className="wrap pb-[clamp(80px,10vw,140px)] pt-[clamp(48px,8vw,104px)] text-center">
        <h1 className="mx-auto max-w-[18ch] text-[clamp(2.6rem,6vw,4.8rem)] font-semibold leading-[1.03] tracking-[-0.035em]">Business insurance for your market</h1>
        <p className="mx-auto mt-5 max-w-[50ch] text-[clamp(1.1rem,1.8vw,1.4rem)] leading-[1.4] text-ink-2">Liability and asset cover, explained for the country your company operates in. Insurers pay the adviser; your business pays no fee.</p>
        <div className="mx-auto mt-12 grid max-w-[980px] gap-4 text-left sm:grid-cols-3">
          {order.map(k => (
            <Link key={k} href={mpath(k)} className="market-card">
              <span className="text-[13px] font-semibold tracking-[.06em] text-steel">{MARKETS[k].code}{k === suggested ? " · Your location" : ""}</span>
              <b className="text-[1.6rem] font-semibold tracking-[-0.02em]">{MARKETS[k].name}</b>
              <span className="text-[15px] text-ink-2">{LINE[k]}</span>
              <span className="mt-2 text-[15px] font-semibold text-[var(--primary)]">Business insurance in {MARKETS[k].name} →</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
