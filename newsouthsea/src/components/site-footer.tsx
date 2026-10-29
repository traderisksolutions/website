import Link from "next/link";
import { LINES } from "@/content/coverage";
import { INDUSTRIES } from "@/content/industries";
import { Lockup } from "@/components/wordmark";
import { site } from "@/site";

/** Lockup 3 with registered names, three link columns (Coverage, Industries, Company), legal line. */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="ftr band">
      <div className="wrap">
        <div className="grid">
          <div className="fcol">
            <Link href="/" className="brand" aria-label={`${site.name} home`}><Lockup /></Link>
            <p className="reg"><span lang="zh-Hant">{site.nameZh}</span><span>{site.entity}</span></p>
            <p className="small">Specialty and commercial lines placement, wording negotiation and claims advocacy for corporates.</p>
            <p className="small" style={{ color: "var(--ink)" }}>{site.email}<br />{site.claimsEmail}<br />{site.phone}</p>
          </div>
          <div><span className="mono">Coverage</span><ul>{LINES.map(l => <li key={l.slug}><Link href={`/coverage/${l.slug}`}>{l.name}</Link></li>)}<li><Link href="/coverage" style={{ color: "var(--navy)" }}>All coverage →</Link></li></ul></div>
          <div><span className="mono">Industries</span><ul>{INDUSTRIES.map(i => <li key={i.slug}><Link href={`/industries/${i.slug}`}>{i.name}</Link></li>)}</ul></div>
          <div><span className="mono">Company</span><ul>
            <li><Link href="/about">About</Link></li><li><Link href="/how-we-work">How it works</Link></li><li><Link href="/how-we-work#terms">Terms of engagement</Link></li><li><Link href="/appetite">Appetite</Link></li><li><Link href="/claims">Claims</Link></li><li><Link href="/contact">Contact</Link></li><li><Link href="/complaints">Complaints</Link></li><li><Link href="/privacy">Privacy</Link></li>
          </ul></div>
        </div>
        <div className="legal"><span>© {year} {site.entity} · Insurance Authority licence {site.licence}</span><span>{site.address}</span></div>
      </div>
    </footer>
  );
}
