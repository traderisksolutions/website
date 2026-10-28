import Link from "next/link";
import { COVERAGE_MENU, INDUSTRY_MENU, PLAIN_LINKS } from "@/content/nav";
import { site } from "@/site";
import { Lockup } from "./wordmark";

/** One bordered box: the full lockup on off-white, link columns, then legal lines. */
export function SiteFooter() {
  const year = new Date().getFullYear();
  const col = "eyebrow";
  return (
    <footer className="bg-stone">
      <div className="wrap py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:gap-8">
          <div className="flex flex-col gap-6">
            <Link href="/" aria-label={`${site.name} home`}><Lockup stacked /></Link>
            <p className="text-[15px] leading-relaxed text-muted">Specialty and commercial lines placement, wording negotiation and claims advocacy for corporates.</p>
            <div className="mt-auto flex flex-col gap-1.5 border-t border-rule pt-5 text-[14px] text-ink">
              <span>{site.email}</span><span>{site.claimsEmail}</span><span>{site.phone}</span>
            </div>
          </div>
          <div>
            <p className={col}>Coverage</p>
            <ul className="mt-5 grid gap-2.5 text-[15px] text-ink-2">
              {COVERAGE_MENU.flatMap(g => g.lines).map(l => <li key={l.href}><Link href={l.href} className="hover:text-ultra">{l.label}</Link></li>)}
              <li><Link href="/coverage" className="text-ultra">All coverage →</Link></li>
            </ul>
          </div>
          <div>
            <p className={col}>Industries</p>
            <ul className="mt-5 grid gap-2.5 text-[15px] text-ink-2">
              {INDUSTRY_MENU.map(l => <li key={l.href}><Link href={l.href} className="hover:text-ultra">{l.label}</Link></li>)}
            </ul>
          </div>
          <div>
            <p className={col}>{site.name}</p>
            <ul className="mt-5 grid gap-2.5 text-[15px] text-ink-2">
              {[...PLAIN_LINKS, { href: "/contact", label: "Contact" }, { href: "/complaints", label: "Complaints" }, { href: "/privacy", label: "Privacy" }].map(l => (
                <li key={l.href}><Link href={l.href} className="hover:text-ultra">{l.label}</Link></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-14 flex flex-col gap-2 border-t border-rule pt-6 text-[12.5px] uppercase tracking-[0.06em] text-muted md:flex-row md:justify-between">
          <span>© {year} {site.entity} · Insurance Authority licence {site.licence}</span>
          <span>{site.address}</span>
        </div>
      </div>
    </footer>
  );
}
