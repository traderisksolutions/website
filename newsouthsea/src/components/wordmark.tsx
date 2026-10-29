import { site } from "@/site";

/* NSS logo set (locked 30 Oct 2026, canvas board 12). No rules, no symbol.
   1 NSS · 2 NSS + 新南海 vertical · 3 NSS over New South Sea + 新南海 vertical · 4 New/South/Sea beside 新/南/海.
   NSS = Newsreader Italic 400, opsz 72. Long form = Newsreader 400 upright. 新南海 = Noto Serif TC 400 upright.
   Below 56 px NSS height use lockup 1; 新南海 never below 12 px. */

const ZH = ["新", "南", "海"];

/** Lockup 1: NSS alone. Size comes from the parent's font-size. */
export function Mark({ className = "" }: { className?: string }) {
  return <span className={`nss ${className}`}>NSS</span>;
}

/** Lockup 3: NSS over New South Sea, 新南海 in a vertical column spanning both. Size from the parent's font-size. */
export function Lockup({ className = "" }: { className?: string }) {
  return (
    <span className={`nss-lockup ${className}`}>
      <span className="nss-stack"><span className="nss">NSS</span><span className="nss-long">{site.name}</span></span>
      <span className="nss-zh" lang="zh-Hant">{ZH.map(c => <span key={c}>{c}</span>)}</span>
    </span>
  );
}
