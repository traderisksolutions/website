import Link from "next/link";
import { CoverArt } from "./cover-art";
import { formatDate, type Article } from "@/content/articles";

export function ArticleMeta({ article }: { article: Article }) {
  return (
    <p className="eyebrow mt-2">
      {formatDate(article.published)} · {article.minutes} min read
    </p>
  );
}

export function ArticleCard({ article }: { article: Article }) {
  return (
    <Link href={`/articles/${article.slug}`} className="group flex flex-col">
      <div className="aspect-[3/2] overflow-hidden rounded-md">
        <div className="h-full transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none">
          <CoverArt article={article} />
        </div>
      </div>
      <h3 className="mt-4 text-[1.2rem] font-semibold leading-snug tracking-tight group-hover:underline">{article.title}</h3>
      <p className="mt-1.5 line-clamp-2 text-[0.95rem] text-ink-2">{article.dek}</p>
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
