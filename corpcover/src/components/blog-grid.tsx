"use client";

import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ArticleCard } from "./article-card";
import { topics, type Article, type Topic } from "@/content/articles";

const options: ("All" | Topic)[] = ["All", ...topics];
const DENSITY = [2, 3, 4] as const;
const GRID = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" } as const;

function DensityIcon({ cols }: { cols: number }) {
  const gap = 1.5, w = (16 - gap * (cols - 1)) / cols;
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
      {Array.from({ length: cols }, (_, i) => <rect key={i} x={i * (w + gap)} y="1" width={w} height="14" fill="currentColor" />)}
    </svg>
  );
}

/** Alps Wills estates grid: "Blogs, n articles", topic filters and a 2/3/4 column switch.
 *  With maxRows, cards past that many rows are hidden at each breakpoint (1, 2 or n columns). */
export function BlogGrid({ articles, label = "Insights", maxRows, initial = "All", footer }: {
  articles: Article[]; label?: string; maxRows?: number; initial?: "All" | Topic; footer?: ReactNode;
}) {
  const [topic, setTopic] = useState<"All" | Topic>(initial);
  const [cols, setCols] = useState<(typeof DENSITY)[number]>(3);
  const list = articles.filter(a => topic === "All" || a.topic === topic);
  const hide = (i: number) => maxRows === undefined ? "" : [
    i >= maxRows ? "max-sm:hidden" : "",
    i >= maxRows * 2 ? "sm:max-lg:hidden" : "",
    i >= maxRows * cols ? "lg:hidden" : "",
  ].join(" ");

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <p className="text-lg"><span className="font-semibold">{label}</span><span className="text-ink-3">, {list.length} {list.length === 1 ? "article" : "articles"}</span></p>
        <div className="flex flex-wrap items-center gap-4">
          <div role="radiogroup" aria-label="Topic" className="flex flex-wrap gap-1.5">
            {options.map(o => (
              <button key={o} type="button" role="radio" aria-checked={topic === o} onClick={() => setTopic(o)}
                className="rounded-full border border-rule px-3.5 py-2 text-[14.5px] text-ink-2 transition-colors hover:border-ink/30 hover:text-ink aria-checked:border-ink aria-checked:bg-ink aria-checked:text-white">
                {o}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Grid density" className="hidden gap-1 lg:flex">
            {DENSITY.map(c => (
              <button key={c} type="button" onClick={() => setCols(c)} aria-pressed={cols === c} aria-label={`${c} columns`}
                className={`rounded p-1 transition-colors ${cols === c ? "text-black" : "text-black/25 hover:text-black/60"}`}>
                <DensityIcon cols={c} />
              </button>
            ))}
          </div>
        </div>
      </div>
      {list.length ? (
        <ul className={`mt-7 grid grid-cols-1 gap-x-4 gap-y-10 sm:grid-cols-2 ${GRID[cols]}`}>
          {list.map((a, i) => <li key={a.slug} className={hide(i)}><ArticleCard article={a} n={i + 1} /></li>)}
        </ul>
      ) : <p className="mt-7 text-ink-3">No blogs on this topic yet.</p>}
      {footer}
    </div>
  );
}

/** The grid opened on the topic named in ?topic=. */
export function BlogGridFromUrl({ articles }: { articles: Article[] }) {
  const t = useSearchParams().get("topic");
  const initial = topics.find(x => x === t) ?? "All";
  return <BlogGrid key={initial} articles={articles} label="All blogs" initial={initial} />;
}
