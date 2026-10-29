"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { mpath, type MarketKey } from "@/lib/market";
import { BIZ, BIZ_BY_ID, COVER_GROUPS, EMAIL_RE } from "@/lib/quote";
import { SERVICES } from "@/lib/services";
import { COVER_LAW, CONTRACT_COVERS, REVIEW_EMAIL_KEY } from "@/lib/cover-tags";

/** Hero form (flex.one): work email, then the policy review form with the email filled in.
 *  The email travels in sessionStorage, never in the URL. */
export function HeroEmail({ m }: { m: MarketKey }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") || "").trim();
    if (!EMAIL_RE.test(email)) { setErr("Check the email address."); return; }
    try { sessionStorage.setItem(REVIEW_EMAIL_KEY, email); } catch { /* private mode: the form asks again */ }
    router.push(`${mpath(m, SERVICES.review.path)}#send`);
  };
  return (
    <form className="fh-form" onSubmit={onSubmit} noValidate>
      <label className="sr-only" htmlFor="hero-email">Work email</label>
      <input id="hero-email" name="email" type="email" autoComplete="email" placeholder="Work email" onChange={() => err && setErr("")} aria-invalid={!!err} aria-describedby={err ? "hero-email-err" : undefined} />
      <button type="submit" className="btn btn-primary">{SERVICES.review.cta}</button>
      {err && <p id="hero-email-err" role="alert" className="fh-err">{err}</p>}
    </form>
  );
}

const ALL = COVER_GROUPS.filter(g => g.name !== "Other");

/** Cover checker (flex.one availability selector): pick a business type, see each cover tagged. */
export function CoverChecker({ m }: { m: MarketKey }) {
  const [biz, setBiz] = useState("restaurant");
  const b = BIZ_BY_ID[biz];
  const groups = [...new Set(BIZ.map(x => x.group))];
  const law = COVER_LAW[m];
  return (
    <div className="ck">
      <div className="ck-pick">
        <label className="ck-label" htmlFor="ck-biz">Business type</label>
        <select id="ck-biz" className="ck-select" value={biz} onChange={e => setBiz(e.target.value)}>
          {groups.map(g => (
            <optgroup key={g} label={g}>{BIZ.filter(x => x.group === g && x.id !== "other").map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>
          ))}
        </select>
        <p className="ck-count"><b>{b.c.length}</b> covers usually held</p>
        <Link href={`${mpath(m, SERVICES.quotes.path)}?biz=${biz}`} className="btn btn-primary">{SERVICES.quotes.cta}</Link>
      </div>
      <div className="ck-grid">
        {ALL.map(g => (
          <div key={g.name} className="ck-group">
            <p className="ck-gname">{g.name}</p>
            <ul>
              {g.items.map(c => {
                const held = b.c.includes(c), isLaw = c === law.cover, contract = CONTRACT_COVERS.includes(c);
                return (
                  <li key={c} className={held || isLaw ? "on" : ""}>
                    <span className="ck-name">{c}</span>
                    <span className="ck-tags">
                      {isLaw && <i className="t-law">Required by law</i>}
                      {contract && <i className="t-con">Usually in contracts</i>}
                      {held && <i className="t-held">Usual for this business</i>}
                    </span>
                    {isLaw && <small className="ck-note">{law.note}</small>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
