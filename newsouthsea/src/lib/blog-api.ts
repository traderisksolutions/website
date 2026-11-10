// Insights come from the TRS dashboard's public feed (Marketing → Articles, published only).
// Fetched with ISR, so a newly published article appears within five minutes without a deploy.
const API = process.env.BLOG_API_URL ?? "https://trs-dashboard-pi.vercel.app/api/public/blog";
const SITE = "newsouthsea.com";
const REVALIDATE = 300;

export type Post = {
  slug: string; title: string; excerpt: string | null; topic: string | null; published_at: string; updated_at: string;
  reading_minutes: number; meta_description: string | null;
};
export type PostFull = Post & { content_html: string; headings: { id: string; text: string }[]; faq: { question: string; answer: string }[] };

export const TOPICS = ["Property", "Liability", "Directors and officers", "Cyber", "Marine and trade", "People", "Claims"] as const;

async function get<T>(query: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}?site=${SITE}${query}`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getPosts(): Promise<Post[]> {
  const posts = (await get<{ articles: Post[] }>(""))?.articles ?? [];
  return posts.sort((a, b) => (a.published_at < b.published_at ? 1 : -1));
}

export async function getPost(slug: string): Promise<PostFull | undefined> {
  return (await get<{ article: PostFull }>(`&slug=${encodeURIComponent(slug)}`))?.article ?? undefined;
}

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-HK", { day: "numeric", month: "long", year: "numeric" });

/** The feed's HTML split at the first paragraph (the direct answer). */
export function splitIntro(html: string): { intro: string; rest: string } {
  const i = html.indexOf("</p>");
  if (i < 0) return { intro: "", rest: html };
  return { intro: html.slice(0, i + 4), rest: html.slice(i + 4) };
}
