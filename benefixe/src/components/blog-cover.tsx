import type { Blog } from "@/content/blogs";
import { PerkIcon } from "./perk-icon";

/** Cover set in type, in the site's three surfaces: ember, night, grey. No illustration. */
export function BlogCover({ blog, compact = false }: { blog: Blog; compact?: boolean }) {
  const tone = blog.tone === "ember" ? "ember text-white" : blog.tone === "night" ? "grain bg-night text-white" : "bg-surface text-ink";
  const sub = blog.tone === "surface" ? "text-ink-3" : "text-white/65";
  if (compact) {
    return (
      <div className={`grid size-full place-items-center overflow-hidden ${tone}`}>
        <PerkIcon name={blog.icon} className="size-6" />
      </div>
    );
  }
  return (
    <div className={`flex size-full flex-col justify-between overflow-hidden p-5 sm:p-6 ${tone}`}>
      <div className="flex items-center justify-between">
        <span className={`font-mono text-[10px] uppercase tracking-[0.12em] ${sub}`}>{blog.topic}</span>
        <PerkIcon name={blog.icon} className="size-5 opacity-80" />
      </div>
      <p className="text-[clamp(1.25rem,2.4vw,1.75rem)] font-medium leading-[1.05] tracking-[-0.03em]">
        {blog.cover.map(l => <span key={l} className="block">{l}</span>)}
      </p>
    </div>
  );
}
