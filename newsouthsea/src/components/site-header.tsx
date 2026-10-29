"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LINES } from "@/content/coverage";
import { INDUSTRIES } from "@/content/industries";
import { Mark } from "@/components/wordmark";
import { site } from "@/site";

type Menu = "ind" | "cov" | null;

/** harvey.ai navbar in buyer order (29 Oct audit): Coverage ▾ · Industries ▾ · How it works · Company · Contact us.
 *  Appetite lives inside the Coverage panel; Claims, Complaints, Privacy and Terms stay in the footer.
 *  Transparent over the home hero until 48px of scroll, then solid with a hairline. Panels open on hover or click. */
const APPETITE = [
  { t: "Core appetite", d: "Property and construction, casualty, financial lines, marine and trade. First read within [x] working days." },
  { t: "Case by case", d: "US products exposure, cyber after an incident, D&O with a going-concern note, typhoon-exposed sites, large contract works." },
  { t: "Not written", d: "Personal lines, life and medical, employee benefits, aviation and energy hull." },
];

export function SiteHeader() {
  const path = usePathname();
  const [menu, setMenu] = useState<Menu>(null);
  const [drawer, setDrawer] = useState(false);
  const [over, setOver] = useState(path === "/");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [seen, setSeen] = useState(path);
  if (seen !== path) { setSeen(path); setMenu(null); setDrawer(false); }

  useEffect(() => {
    const onScroll = () => setOver(path === "/" && window.scrollY < 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(null); setDrawer(false); } };
    const onClick = (e: MouseEvent) => { if (!(e.target as Element).closest?.(".hdr")) setMenu(null); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("keydown", onKey); document.removeEventListener("click", onClick); };
  }, [path]);

  useEffect(() => { document.body.style.overflow = drawer ? "hidden" : ""; }, [drawer]);

  const open = (m: Menu) => { if (timer.current) clearTimeout(timer.current); setMenu(m); };
  const closeSoon = () => { timer.current = setTimeout(() => setMenu(null), 140); };
  const current = (href: string) => (path === href || path.startsWith(`${href}/`) ? "page" : undefined);
  const chevron = <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="m3 4.5 3 3 3-3" /></svg>;
  const trigger = (m: Exclude<Menu, null>, label: string) => (
    <div onMouseEnter={() => open(m)} onMouseLeave={closeSoon}>
      <button type="button" aria-expanded={menu === m} aria-controls={`panel-${m}`} onClick={e => { e.stopPropagation(); open(m); }}>{label} {chevron}</button>
    </div>
  );
  const families = [...new Set(LINES.map(l => l.family))];
  const col = (fs: string[]) => fs.map((f, i) => (
    <div key={f} style={i ? { marginTop: 8 } : undefined} className="fam">
      <span className="mono">{f}</span>
      {LINES.filter(l => l.family === f).map(l => (
        <Link key={l.slug} className="pi" href={`/coverage/${l.slug}`}><span className="t">{l.name}</span><span className="d">{l.summary}</span></Link>
      ))}
    </div>
  ));

  return (
    <>
      <header className={`hdr ${over ? "over" : ""}`} onMouseLeave={closeSoon}>
        <div className="wrap bar">
          <button type="button" className="burger" aria-label="Open menu" aria-expanded={drawer} onClick={() => setDrawer(true)}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M3 6h14M3 10h14M3 14h14" /></svg>
          </button>
          <Link href="/" className="mark" aria-label={`${site.name} home`}><Mark /></Link>
          <nav className="nav" aria-label="Primary">
            {trigger("cov", "Coverage")}
            {trigger("ind", "Industries")}
            <Link href="/how-we-work" aria-current={current("/how-we-work")}>How it works</Link>
            <Link href="/about" aria-current={current("/about")}>Company</Link>
          </nav>
          <div className="right"><Link href="/contact" className="btn sm">Contact us</Link></div>
        </div>

        <div className="panel cov" id="panel-cov" hidden={menu !== "cov"} onMouseEnter={() => open("cov")} onMouseLeave={closeSoon}>
          <div className="wrap">
            <div className="grp">{col(families.slice(0, 2))}</div>
            <div className="grp">{col(families.slice(2, 3))}</div>
            <div className="grp">{col(families.slice(3))}</div>
            <div className="grp"><div className="fam"><span className="mono">Appetite</span>
              {APPETITE.map(a => <Link key={a.t} className="pi" href="/appetite"><span className="t">{a.t}</span><span className="d">{a.d}</span></Link>)}
            </div></div>
            <div className="foot">
              <Link className="pi" href="/coverage"><span className="t">All coverage →</span><span className="d">Ten lines, four families.</span></Link>
              <Link className="pi" href="/appetite"><span className="t">Check appetite by class →</span><span className="d">Core, case by case, not written.</span></Link>
              <Link className="pi" href="/claims"><span className="t">Notify a claim →</span><span className="d">{site.claimsEmail}</span></Link>
            </div>
          </div>
        </div>

        <div className="panel ind" id="panel-ind" hidden={menu !== "ind"} onMouseEnter={() => open("ind")} onMouseLeave={closeSoon}>
          <div className="wrap">
            <div className="grp"><span className="mono">Sectors</span>
              {INDUSTRIES.slice(0, 3).map(i => <Link key={i.slug} className="pi" href={`/industries/${i.slug}`}><span className="t">{i.name}</span><span className="d">{i.summary}</span></Link>)}
            </div>
            <div className="grp"><span className="mono">&nbsp;</span>
              {INDUSTRIES.slice(3).map(i => <Link key={i.slug} className="pi" href={`/industries/${i.slug}`}><span className="t">{i.name}</span><span className="d">{i.summary}</span></Link>)}
              <Link className="pi" href="/industries"><span className="t">All industries →</span><span className="d">Six sectors, named risks, the lines that make up each programme.</span></Link>
            </div>
            <Link className="feat" href="/industries">
              <Image src="/images/port.jpg" alt="" width={600} height={375} />
              <span className="pi"><span className="t">Named risks per sector</span><span className="d">The exposure, what it costs when it happens, and the cover that answers it.</span></span>
            </Link>
          </div>
        </div>
      </header>

      <div className="drawer" hidden={!drawer}>
        <div className="top"><Link href="/" className="mark" aria-label={`${site.name} home`}><Mark /></Link><button type="button" className="burger" aria-label="Close menu" onClick={() => setDrawer(false)}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M5 5l10 10M15 5L5 15" /></svg></button></div>
        <div className="grp plain"><ul>
          <li><Link href="/coverage">Coverage</Link></li><li><Link href="/industries">Industries</Link></li><li><Link href="/how-we-work">How it works</Link></li><li><Link href="/about">Company</Link></li><li><Link href="/contact">Contact</Link></li>
        </ul></div>
        <div className="grp"><span className="mono">Coverage</span><ul>{LINES.map(l => <li key={l.slug}><Link href={`/coverage/${l.slug}`}>{l.name}</Link></li>)}<li><Link href="/appetite">Appetite</Link></li></ul></div>
        <div className="grp"><span className="mono">Industries</span><ul>{INDUSTRIES.map(i => <li key={i.slug}><Link href={`/industries/${i.slug}`}>{i.name}</Link></li>)}</ul></div>
        <div className="grp"><span className="mono">Clients</span><ul><li><Link href="/claims">Notify a claim</Link></li><li><Link href="/complaints">Complaints</Link></li></ul></div>
        <Link href="/contact" className="btn">Contact us</Link>
      </div>
    </>
  );
}
