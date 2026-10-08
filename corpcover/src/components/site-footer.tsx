import Link from "next/link";
import { site, reviewHref } from "@/site";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-rule">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>© {new Date().getFullYear()} {site.name}. General information, not advice on a specific policy.</p>
        <ul className="flex gap-5">
          <li><Link href="/articles" className="hover:text-ink">Guides</Link></li>
          <li><a href={reviewHref} className="hover:text-ink">{site.email}</a></li>
        </ul>
      </div>
    </footer>
  );
}
