import Link from "next/link";
import { contact } from "@/content";
import { Wordmark } from "./wordmark";

const cols = [
  { title: "Insider Pass", links: [["/", "Overview"], ["/#membership", "Membership"], ["/perks", "All perks"], ["/#faq", "FAQ"]] },
  { title: "Employers", links: [["/group-benefits", "Group benefits"], ["/group-benefits#plans", "Plans"], ["/group-benefits#quote", "Get a quote"], ["/group-benefits#faq", "FAQ"]] },
  { title: "Resources", links: [["/blogs", "Blogs"]] },
  { title: "Contact", links: [[`mailto:${contact.email}`, contact.email]] },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-rule">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <span className="text-[12px] text-ink-3">© {new Date().getFullYear()} Benefixe · Singapore</span>
        </div>
        {cols.map(c => (
          <nav key={c.title} aria-label={c.title} className="flex flex-col gap-2.5 text-[13px]">
            <span className="font-medium">{c.title}</span>
            {c.links.map(([href, label]) => <Link key={href} href={href} className="text-ink-2 hover:text-ink">{label}</Link>)}
          </nav>
        ))}
      </div>
    </footer>
  );
}
