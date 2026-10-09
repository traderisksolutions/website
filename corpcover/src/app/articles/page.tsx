import type { Metadata } from "next";
import { ArticleFeed } from "@/components/article-feed";
import { articles } from "@/content/articles";

export const metadata: Metadata = { title: "Guides", description: "Guides to business insurance in Singapore, by topic.", alternates: { canonical: "/articles" }, twitter: { card: "summary_large_image" } };

export default function Guides() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-4xl font-bold tracking-tight">Guides</h1>
        <p className="eyebrow">{articles.length} guides</p>
      </div>
      <div className="mt-8">
        <ArticleFeed />
      </div>
    </main>
  );
}
