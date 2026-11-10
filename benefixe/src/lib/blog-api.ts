// Articles come from the TRS dashboard's public feed (Marketing → Articles, published only).
// Fetched with ISR, so a newly published article appears within five minutes without a deploy.
const API = process.env.BLOG_API_URL ?? "https://trs-dashboard-pi.vercel.app/api/public/blog";
const SITE = "benefixe.com";
const REVALIDATE = 300;

export type Post = {
  slug: string; title: string; excerpt: string | null; topic: string | null; published_at: string; updated_at: string;
  reading_minutes: number; meta_description: string | null;
};
export type PostFull = Post & { content_html: string; headings: { id: string; text: string }[]; faq: { question: string; answer: string }[] };

export const TOPICS = ["Group insurance", "Perks", "Employers"] as const;

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

/** A photo from /public/img for the card, steady per slug, chosen within the topic's set. */
const IMG: Record<string, string[]> = {
  "Group insurance": ["hospital", "ward", "doctor", "hospital-suite", "physio", "tooth", "pulse", "family"],
  Perks: ["bike", "sim", "dumbbell", "coffee", "sauna", "taxi", "hotel", "book", "bag", "moon"],
  Employers: ["coworkers", "team", "meeting", "handshake", "desk", "laptopnotes", "collab", "consult", "writing", "glasshouse"],
};
export function photoFor(slug: string, topic: string | null): string {
  const set = IMG[topic ?? ""] ?? IMG.Employers;
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `/img/${set[h % set.length]}.jpg`;
}

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });

/** The feed's HTML split at the first paragraph (the direct answer), set above the photo. */
export function splitIntro(html: string): { intro: string; rest: string } {
  const i = html.indexOf("</p>");
  if (i < 0) return { intro: "", rest: html };
  return { intro: html.slice(0, i + 4), rest: html.slice(i + 4) };
}
