import Image from "next/image";
import Link from "next/link";
import { CoverArt } from "./cover-art";
import { blogPhotos } from "@/lib/blog-photos";
import type { Article } from "@/content/articles";

/** Alps Wills card: rounded 4:3 photo with the topic on it, then the number and the title. */
export function ArticleCard({ article, n }: { article: Article; n?: number }) {
  const photo = blogPhotos[article.slug];
  return (
    <Link href={`/${"market" in article ? (article as { market: string }).market : "sg"}/articles/${article.slug}`} className="bcard group block">
      <span className="bcard-img relative block aspect-[4/3] overflow-hidden rounded-[24px] bg-ink/5">
        {photo
          ? <Image src={photo} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" placeholder="blur" className="object-cover" />
          : <CoverArt article={article} />}
        <span className="absolute left-3.5 top-3.5 z-[1] rounded-full bg-white/90 px-3 py-1.5 text-[13px] font-medium text-ink backdrop-blur">{article.topic}</span>
      </span>
      <span className="mt-4 flex items-baseline gap-3 text-[clamp(1.2rem,1.5vw,1.45rem)] font-semibold leading-[1.28] tracking-[-0.02em]">
        {n !== undefined && <span className="flex-none text-base font-normal tabular-nums text-black/35">{String(n).padStart(2, "0")}</span>}
        <span className="group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">{article.title}</span>
      </span>
      <span className={`mt-1.5 block text-sm text-ink-3 ${n !== undefined ? "pl-[calc(2ch+0.75rem)]" : ""}`}>{article.minutes} min read</span>
    </Link>
  );
}
