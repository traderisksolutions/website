import Link from "next/link";
import { contact } from "@/content";
import { Wordmark } from "./wordmark";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-rule">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <a href={`mailto:${contact.email}`} className="text-sm text-ink-2 hover:text-ink">{contact.email}</a>
        </div>
        <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm text-ink-2 sm:grid-cols-3" aria-label="Footer">
          <Link href="/" className="hover:text-ink">Insider Pass</Link>
          <Link href="/group-benefits" className="hover:text-ink">Group benefits</Link>
          <Link href="/perks" className="hover:text-ink">All perks</Link>
          <Link href="/#faq" className="hover:text-ink">Pass FAQ</Link>
          <Link href="/group-benefits#faq" className="hover:text-ink">Employer FAQ</Link>
          <Link href="/group-benefits#quote" className="hover:text-ink">Get a quote</Link>
        </nav>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-10 text-xs text-ink-3 sm:px-6">© {new Date().getFullYear()} Benefixe. Singapore.</div>
    </footer>
  );
}
