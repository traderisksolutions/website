import Link from "next/link";
import { CoverArt } from "./cover-art";
import { formatDate, type Article } from "@/content/articles";

export function ArticleMeta({ article }: { article: Article }) {
  return (
    <p className="eyebrow mt-1.5">
      {formatDate(article.published)} · {article.minutes} min read
    </p>
  );
}

export function ArticleCard({ article }: { article: Article }) {
  return (
    <Link href={`/articles/${article.slug}`} className="group flex flex-col">
      <div className="aspect-[3/2] overflow-hidden rounded-md sm:aspect-[16/9] lg:[@media(max-height:880px)]:aspect-[2/1] lg:[@media(max-height:760px)]:aspect-[5/2]">
        <div className="h-full transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none">
          <CoverArt article={article} />
        </div>
      </div>
      <h3 className="mt-2.5 text-[1.05rem] font-semibold leading-snug tracking-tight group-hover:underline lg:[@media(max-height:760px)]:line-clamp-1">{article.title}</h3>
      <p className="mt-1 line-clamp-1 text-[0.92rem] text-ink-2 [@media(max-height:1000px)]:hidden">{article.dek}</p>
      <ArticleMeta article={article} />
    </Link>
  );
}

/** Compact row item: title and meta on the left, a square thumbnail on the right. */
export function ArticleRow({ article }: { article: Article }) {
  return (
    <Link href={`/articles/${article.slug}`} className="group flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="font-semibold leading-snug group-hover:underline">{article.title}</p>
        <ArticleMeta article={article} />
      </div>
      <div className="size-16 shrink-0 overflow-hidden rounded-md">
        <CoverArt article={article} compact />
      </div>
    </Link>
  );
}
