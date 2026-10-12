"use client";

import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ArticleCard } from "./article-card";
import { topics, type Article, type Topic } from "@/content/articles";

const options: ("All" | Topic)[] = ["All", ...topics];

/** Guides in four columns, filtered by topic. */
export function ArticleFeed({ articles, action, onPhoto = false, initial = "All" }: { articles: Article[]; action?: ReactNode; onPhoto?: boolean; initial?: "All" | Topic }) {
  const [topic, setTopic] = useState<"All" | Topic>(initial);
  const shown = articles.filter(a => topic === "All" || a.topic === topic);

  return (
    <div>
      {/* onPhoto: the tab row is pulled up onto the bottom edge of the hero photo. */}
      <div className={`flex items-center justify-between gap-4 ${onPhoto ? "relative z-10 -mt-[72px] h-[72px]" : ""}`}>
        <div role="radiogroup" aria-label="Topic" className={`${onPhoto ? "photo-glass-group" : "glass-group"} inline-flex min-w-0 max-w-full gap-1 overflow-x-auto p-1`}>
          {options.map(o => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={topic === o}
              onClick={() => setTopic(o)}
              className={`shrink-0 rounded-full border border-transparent px-3.5 py-1.5 text-sm ${topic === o ? "glass-bubble font-semibold text-ink" : onPhoto ? "text-white/90 hover:text-white" : "text-ink-2 hover:text-ink"}`}
            >
              {o}
            </button>
          ))}
        </div>
        {action && <div className="hidden sm:block">{action}</div>}
      </div>
      <div className={`${onPhoto ? "mt-4" : "mt-3.5"} grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4`}>
        {shown.map(a => <ArticleCard key={a.slug} article={a} />)}
      </div>
    </div>
  );
}

/** The feed opened on the topic named in ?topic=, as linked from the Resources menu. */
export function ArticleFeedFromUrl({ articles }: { articles: Article[] }) {
  const t = useSearchParams().get("topic");
  const initial = topics.find(x => x === t) ?? "All";
  return <ArticleFeed key={initial} articles={articles} initial={initial} />;
}
