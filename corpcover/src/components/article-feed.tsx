"use client";

import { useState } from "react";
import { ArticleCard } from "./article-card";
import { articles, topics, type Topic } from "@/content/articles";

const options: ("All" | Topic)[] = ["All", ...topics];

/** Latest guides, filtered by topic. */
export function ArticleFeed({ limit }: { limit?: number }) {
  const [topic, setTopic] = useState<"All" | Topic>("All");
  const shown = articles.filter(a => topic === "All" || a.topic === topic).slice(0, limit);

  return (
    <div>
      <div role="radiogroup" aria-label="Topic" className="glass-group inline-flex max-w-full gap-1 overflow-x-auto p-1">
        {options.map(o => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={topic === o}
            onClick={() => setTopic(o)}
            className={`shrink-0 rounded-full border border-transparent px-3.5 py-1.5 text-sm ${topic === o ? "glass-bubble font-semibold text-ink" : "text-ink-2 hover:text-ink"}`}
          >
            {o}
          </button>
        ))}
      </div>
      <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map(a => <ArticleCard key={a.slug} article={a} />)}
      </div>
    </div>
  );
}
