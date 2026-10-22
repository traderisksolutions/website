"use client";

import Link from "next/link";
import { site } from "@/site";
import { Logo } from "./logo";
import { Subscribe } from "./subscribe";
import { usePathname } from "next/navigation";
import { MARKETS, MARKET_KEYS, marketOf, mpath } from "@/lib/market";

const whatsapp = `https://wa.me/65${site.phone.replace(/\s/g, "")}`;

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <nav aria-label={title} className="flex flex-col items-start text-[15px] [&_a]:py-1.5 [&_a]:text-ink-2 [&_a]:transition-colors [&_a:hover]:text-ink">
      <p className="py-1.5 text-[13px] text-ink-3">{title}</p>
      {children}
    </nav>
  );
}

/** Rillet footer: white, link columns, letter box on cream, legal line, large wordmark. */
export function SiteFooter() {
  const m = marketOf(usePathname());
  return (
    <footer className="mt-auto overflow-hidden bg-paper text-ink">
      <div className="wrap pt-[clamp(72px,9vw,120px)]">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2.8fr]">
          <div className="flex flex-col gap-4">
            <span className="logo"><Logo id="logo-foot" name={site.name} /></span>
            <p className="max-w-[30ch] text-sm text-ink-2">Business insurance guides and advice for companies in Singapore, Malaysia and Hong Kong. Singapore headquartered.</p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
            <Column title="Services">
              <Link href={mpath(m, "/policy-review")}>Review</Link>
              <Link href={mpath(m, "/ask")}>Ask</Link>
              <Link href={mpath(m, "/get-covered")}>Choose</Link>
              <Link href={mpath(m, "/claims")}>Claim second opinion</Link>
            </Column>
            <Column title="Blogs">
              <Link href={mpath(m, "/articles")}>All blogs</Link>
              {["Required by law", "Liability", "Property", "Directors", "Claims"].map(t => <Link key={t} href={`${mpath(m, "/articles")}?topic=${encodeURIComponent(t)}`}>{t}</Link>)}
            </Column>
            <Column title="Company">
              <Link href={mpath(m, "/about")}>About</Link>
              <Link href={mpath(m, "/how-we-compare")}>How we compare</Link>
              <Link href={mpath(m, "/ask")}>FAQ</Link>
            </Column>
            <Column title="Contact">
              <a href={whatsapp} target="_blank" rel="noopener">Message an adviser</a>
              <a href={`tel:+65${site.phone.replace(/\s/g, "")}`}>+65 {site.phone}</a>
              <a href={`mailto:${site.email}`} className="break-all">{site.email}</a>
              <span className="mt-3 market-switch" aria-label="Market">{MARKET_KEYS.map(k => <Link key={k} href={mpath(k)} aria-current={k === m ? "true" : undefined} title={`Business insurance in ${MARKETS[k].name}`}>{MARKETS[k].code}</Link>)}</span>
            </Column>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-6 rounded-[var(--r-md)] bg-base p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <p className="t-h3">The Corp Cover letter</p>
            <p className="mt-1 text-[15px] text-ink-2">One email a week. New guides on business insurance.</p>
          </div>
          <Subscribe variant="inline" className="md:max-w-[460px] md:flex-1 [&_form]:max-w-none [&_input]:bg-paper" />
        </div>

        <div className="mt-10 flex flex-col gap-3 text-[13px] text-ink-3 md:flex-row md:justify-between">
          <p className="max-w-[72ch]">Corp Cover is not an insurance broker or a financial adviser and is not licensed by an insurance regulator. Guides are general information, not advice on a specific policy.</p>
          <p className="shrink-0">© {new Date().getFullYear()} {site.name} · {site.address}</p>
        </div>
      </div>
      <p aria-hidden className="footer-wordmark wrap">{site.name}</p>
    </footer>
  );
}
