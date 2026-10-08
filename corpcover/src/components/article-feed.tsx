"use client";

import { useState, type ReactNode } from "react";
import { ArticleCard } from "./article-card";
import { articles, topics, type Topic } from "@/content/articles";

const options: ("All" | Topic)[] = ["All", ...topics];

/** Guides in four columns, filtered by topic. */
export function ArticleFeed({ action }: { action?: ReactNode }) {
  const [topic, setTopic] = useState<"All" | Topic>("All");
  const shown = articles.filter(a => topic === "All" || a.topic === topic);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div role="radiogroup" aria-label="Topic" className="glass-group inline-flex min-w-0 max-w-full gap-1 overflow-x-auto p-1">
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
        {action && <div className="hidden sm:block">{action}</div>}
      </div>
      <div className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map(a => <ArticleCard key={a.slug} article={a} />)}
      </div>
    </div>
  );
}
