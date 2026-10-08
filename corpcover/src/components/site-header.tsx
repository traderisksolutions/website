import Link from "next/link";
import { site, reviewHref } from "@/site";

const nav = [
  { href: "/", label: "Home" },
  { href: "/articles", label: "Guides" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-rule bg-paper">
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-4 sm:px-6 sm:py-5">
        <span aria-hidden className="hidden sm:block" />
        <Link href="/" className="col-start-1 justify-self-start font-serif text-[1.65rem] italic leading-none tracking-tight sm:col-start-2 sm:justify-self-center sm:text-[2.1rem]">
          {site.name}
        </Link>
        <a href={reviewHref} className="col-start-3 justify-self-end rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink hover:opacity-90 sm:px-4">
          Get quotes
        </a>
      </div>
      <nav aria-label="Main" className="border-t border-rule">
        <ul className="mx-auto flex max-w-6xl gap-6 overflow-x-auto px-4 text-[0.93rem] text-ink-2 sm:justify-center sm:gap-8 sm:px-6">
          {nav.map(n => (
            <li key={n.href} className="shrink-0">
              <Link href={n.href} className="block border-b-2 border-transparent py-3 hover:text-ink">{n.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
