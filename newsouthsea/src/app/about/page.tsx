import type { Metadata } from "next";
import { CloseBand } from "@/components/close-band";
import { Credentials } from "@/components/proof";
import { Eyebrow, Photo, RuleList, SplitHead } from "@/components/ui";
import { site } from "@/site";

export const metadata: Metadata = { title: "About", description: "Placement and claims for complex business risks." };

const PRINCIPLES = [
  { title: "Wording before price", body: "Two policies at the same premium can pay very different claims. Every quote is compared clause by clause." },
  { title: "Selected markets", body: "Risks go to insurers with real appetite for them. A short list of strong approaches returns better terms than a wide circulation." },
  { title: "Claims are part of the job", body: "The broker who placed the cover stays with the claim. Placement and claims advice are not separated." },
  { title: "Advice in writing", body: "Recommendations, declinatures and the reasons for both are recorded and sent to the client." },
];

// Illustrative placeholders until the client supplies the team.
const TEAM = Array.from({ length: 4 }, (_, i) => ({ name: `[Name ${i + 1}]`, role: "[Title]", bio: "[Prior roles, markets and lines handled, years in the market.]" }));

export default function About() {
  return (
    <>
      <section className="wrap pt-14 lg:pt-24">
        <div className="reveal grid gap-6 lg:grid-cols-12 lg:gap-12">
          <Eyebrow className="pt-3 lg:col-span-4">About {site.name} · {site.nameZh}</Eyebrow>
          <div className="flex flex-col gap-6 lg:col-span-8">
            <h1 className="display h1 text-ink">The same brokers from placement to claim.</h1>
            <p className="lede">[Founding year, founders and the reason the firm was set up. Two sentences.]</p>
          </div>
        </div>
        <Photo src="night" alt="Hong Kong at night" priority className="mt-14 aspect-[16/9] w-full md:aspect-[21/9] lg:mt-20" />
      </section>

      <section className="wrap section flex flex-col gap-12">
        <SplitHead num="01" label="Principles" title="How we work" />
        <RuleList items={PRINCIPLES} numbered />
      </section>

      <section className="bg-stone">
        <div className="wrap section flex flex-col gap-12">
          <SplitHead num="02" label="Team" title="Team" lede="Placeholder profiles. To be replaced with the client's team." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TEAM.map(t => (
              <div key={t.name} className="flex flex-col overflow-hidden border border-rule bg-surface">
                <Photo alt="Team portrait to be supplied" className="aspect-[4/5] !rounded-none" />
                <div className="flex flex-col gap-1 p-5">
                  <span className="text-[17px] font-semibold text-ink">{t.name}</span>
                  <span className="text-[14px] text-muted">{t.role}</span>
                  <span className="body mt-2 !text-[14px]">{t.bio}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="wrap section"><Credentials /></section>
      <CloseBand />
    </>
  );
}
