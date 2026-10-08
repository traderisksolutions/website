import Link from "next/link";
import { CoverTile } from "./cover-tile";
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
      <CoverTile article={article} />
      <h3 className="mt-4 text-[1.2rem] font-semibold leading-snug group-hover:underline">{article.title}</h3>
      <p className="mt-1.5 line-clamp-2 text-[0.95rem] text-ink-2">{article.dek}</p>
      <ArticleMeta article={article} />
    </Link>
  );
}
