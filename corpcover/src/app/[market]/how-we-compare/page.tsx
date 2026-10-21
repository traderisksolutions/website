import type { Metadata } from "next";
import Link from "next/link";
import { MARKETS, alternates, mpath, type MarketKey, marketParam } from "@/lib/market";

export async function generateMetadata({ params }: { params: Promise<{ market: string }> }): Promise<Metadata> {
  const m = await marketParam(params);
  return { ...meta, alternates: alternates(m, "/how-we-compare") };
}

const REGULATOR: Record<MarketKey, string> = { sg: "the Ministry of Manpower", my: "SOCSO (PERKESO) and Bank Negara Malaysia", hk: "the Labour Department and the Insurance Authority" };

const meta: Metadata = {
  title: "How we compare insurers",
  description: "The criteria behind every Corp Cover \"Best\" guide: limits, excess, extensions, exclusions, territory, claims basis and claims handling. How pages are reviewed and updated.",
  twitter: { card: "summary_large_image" },
};

const criteria: [string, string, string][] = [
  ["Limit of liability or sum insured", "The most the policy pays, per claim and in total for the year.", "Whether the limit matches what your lease, contract or tender asks for."],
  ["Excess (deductible)", "The part of each claim your business pays before the insurer pays.", "A low premium with a high excess can cost more after one claim."],
  ["Extensions", "Optional or included additions, such as cross liability or loss of documents.", "Which extensions are included as standard and which cost extra."],
  ["Exclusions", "What the policy will not pay for.", "Exclusions that match your trade, such as height work, pollution or contractual liability."],
  ["Territorial and jurisdiction scope", "Where events must happen, and where claims may be brought.", "Exports to the USA or Canada, or staff working overseas."],
  ["Claims basis", "Occurrence (when the event happened) or claims-made (when the claim is made).", "The retroactive date on claims-made policies such as professional indemnity."],
  ["Claims handling", "How the insurer receives, assesses and settles claims.", "Reporting deadlines, the documents asked for, and who handles the claim."],
  ["Premium", "The price, after GST and any loading for claims history.", "Premium only after the criteria above are equal."],
];

export default async function HowWeCompare({ params }: { params: Promise<{ market: string }> }) {
  const m = await marketParam(params), M = MARKETS[m];
  return (
    <main className="flex-1">
      <section className="wrap pb-12 pt-[clamp(48px,8vw,104px)]">
        <h1 className="text-[clamp(3rem,7vw,5.6rem)] font-semibold leading-[1.02] tracking-[-0.035em]">How we compare insurers</h1>
        <p className="mt-5 max-w-[50ch] text-[clamp(1.2rem,1.9vw,1.6rem)] leading-[1.35] tracking-[-0.015em] text-ink-2">
          Every &ldquo;Best&rdquo; guide on Corp Cover ranks cover against the same eight criteria. Best means the closest fit to your business on these criteria. It is not a claim that one insurer is better for everyone.
        </p>
      </section>

      <section className="wrap pb-16">
        <div className="overflow-x-auto rounded-[20px] bg-base">
          <table className="w-full min-w-[720px] border-collapse text-left text-[15px]">
            <thead><tr className="text-[13px] text-ink-2"><th className="px-5 py-4 font-semibold">Criterion</th><th className="px-5 py-4 font-semibold">What it means</th><th className="px-5 py-4 font-semibold">What we check</th></tr></thead>
            <tbody>
              {criteria.map(([c, m, w]) => (
                <tr key={c} className="border-t border-rule align-top"><td className="px-5 py-4 font-medium">{c}</td><td className="px-5 py-4 text-ink-2">{m}</td><td className="px-5 py-4 text-ink-2">{w}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="wrap grid gap-12 pb-[clamp(80px,10vw,140px)] lg:grid-cols-3">
        <div className="grid content-start gap-3">
          <h2 className="text-[1.6rem] font-semibold tracking-[-0.02em]">Sources</h2>
          <p className="text-ink-2">Statutory figures come from the agency that sets them, such as {REGULATOR[m]}. Policy details come from the insurer&apos;s own {M.name} product pages and wordings. Each guide links its sources.</p>
        </div>
        <div className="grid content-start gap-3">
          <h2 className="text-[1.6rem] font-semibold tracking-[-0.02em]">Independence</h2>
          <p className="text-ink-2">Insurers pay our advisers commission on the policies they place. No insurer pays to appear in a guide or to be listed first. Lists are not ranked by commission.</p>
        </div>
        <div className="grid content-start gap-3">
          <h2 className="text-[1.6rem] font-semibold tracking-[-0.02em]">Updates</h2>
          <p className="text-ink-2">Guides are reviewed at least once a year and when a rule or product changes. The date on each guide shows the last review. Wording differs by insurer, so a guide is general information, not advice on a specific policy.</p>
          <Link href={mpath(m, "/get-covered")} className="btn btn-primary mt-3 justify-self-start">Get covered</Link>
        </div>
      </section>
    </main>
  );
}
