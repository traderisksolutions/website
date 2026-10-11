"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { blogs, topics, type Topic } from "@/content/blogs";
import { BlogCard } from "./blog-card";

const options: ("All" | Topic)[] = ["All", ...topics];

/** Blogs in three columns, filtered by topic. */
export function BlogFeed({ initial = "All" }: { initial?: "All" | Topic }) {
  const [topic, setTopic] = useState<"All" | Topic>(initial);
  const shown = blogs.filter(b => topic === "All" || b.topic === topic);
  return (
    <div>
      <div role="radiogroup" aria-label="Topic" className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-ink/5 p-1">
        {options.map(o => (
          <button key={o} type="button" role="radio" aria-checked={topic === o} onClick={() => setTopic(o)}
            className={`h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors sm:px-4 ${topic === o ? "bg-paper text-ink shadow-[0_1px_2px_rgba(0,0,0,.08),0_0_0_1px_rgba(10,10,10,.04)]" : "text-ink-2 hover:text-ink"}`}>
            {o}
          </button>
        ))}
      </div>
      <div className="mt-8 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map(b => <BlogCard key={b.slug} blog={b} />)}
      </div>
    </div>
  );
}

/** The feed opened on the topic named in ?topic=, as linked from the Resources menu. */
export function BlogFeedFromUrl() {
  const t = useSearchParams().get("topic");
  const initial = topics.find(x => x === t) ?? "All";
  return <BlogFeed key={initial} initial={initial} />;
}
