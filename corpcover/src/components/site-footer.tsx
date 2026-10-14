import Link from "next/link";
import { site } from "@/site";
import { StartButton } from "./start-actions";

const whatsapp = `https://wa.me/65${site.phone.replace(/\s/g, "")}`;

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <nav aria-label={title} className="flex flex-col gap-3 text-[15px] [&_a]:text-white/85 [&_a]:transition-colors [&_a:hover]:text-white [&_button]:text-left [&_button]:text-white/85 [&_button:hover]:text-white">
      <p className="text-sm text-white/40">{title}</p>
      {children}
    </nav>
  );
}

/** Alps Wills footer: the page fades into a dark burgundy base, a closing line, then columns. */
export function SiteFooter() {
  return (
    <footer className="mt-auto overflow-hidden bg-[#0d0608] text-white">
      <div className="footer-fade px-4 pb-[120px] pt-[260px] text-center">
        <h2 className="mx-auto max-w-[16ch] text-[clamp(2.6rem,5.6vw,4rem)] font-semibold leading-[1.05] tracking-[-0.025em]">Talk to an adviser about your cover.</h2>
        <div className="mt-10 flex flex-wrap justify-center gap-2.5">
          <StartButton flow="chat" className="btn btn-white">Ask a question</StartButton>
          <a href={whatsapp} target="_blank" rel="noopener" className="btn btn-wa">Chat on WhatsApp</a>
        </div>
      </div>
      <div className="wrap grid gap-14 pb-10 lg:grid-cols-[1.3fr_2fr]">
        <div className="flex flex-col gap-4">
          <span className="logo"><span className="logo-mark" aria-hidden />{site.name}</span>
          <p className="max-w-xs text-sm text-white/55">Plain guides to business insurance for Singapore companies.</p>
          <address className="text-sm not-italic leading-relaxed text-white/55">
            {site.address}<br />
            <a href={`tel:+65${site.phone.replace(/\s/g, "")}`} className="hover:text-white">+65 {site.phone}</a> · <a href={`mailto:${site.email}`} className="hover:text-white">{site.email}</a>
          </address>
        </div>
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          <Column title="Resources">
            <Link href="/articles">Blogs</Link>
            <Link href="/#faq">FAQ</Link>
          </Column>
          <Column title="Company">
            <Link href="/about">About</Link>
            <Link href="/policy-review">Policy review</Link>
            <StartButton flow="chat">Ask a question</StartButton>
          </Column>
          <Column title="Topics">
            {["Required by law", "Liability", "Property", "Directors"].map(t => <Link key={t} href={`/articles?topic=${encodeURIComponent(t)}`}>{t}</Link>)}
          </Column>
        </div>
      </div>
      <p className="wrap pb-10 text-xs text-white/40">© {new Date().getFullYear()} {site.name}. General information, not advice on a specific policy.</p>
    </footer>
  );
}
