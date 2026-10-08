import type { Article } from "@/content/articles";

const tileBg: Record<Article["tile"], string> = {
  sand: "bg-tile-sand", sage: "bg-tile-sage", sky: "bg-tile-sky", blush: "bg-tile-blush",
};

/** Typeset cover art: the guide's title on its tile colour, in place of an illustration. */
export function CoverTile({ article, size = "lg" }: { article: Article; size?: "lg" | "sm" }) {
  if (size === "sm") {
    return (
      <div aria-hidden className={`${tileBg[article.tile]} flex aspect-square w-16 shrink-0 items-end rounded-md p-1.5`}>
        <span className="font-serif text-[0.6rem] leading-tight text-ink">{article.topic}</span>
      </div>
    );
  }
  return (
    <div aria-hidden className={`${tileBg[article.tile]} flex aspect-[3/2] flex-col justify-between rounded-lg p-5`}>
      <span className="eyebrow !text-ink-2">{article.topic}</span>
      <span className="max-w-[16ch] font-serif text-[1.55rem] leading-[1.1] tracking-tight text-ink">{article.title}</span>
    </div>
  );
}
