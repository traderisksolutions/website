// Blogs come from two places: the TRS dashboard's public feed (articles approved in
// Marketing → Articles) and the hand-written entries in src/content/blogs.ts. The feed wins on
// a slug both have; the local list keeps the site whole when the feed is empty or down.
// Fetched with ISR, so a newly approved article shows within five minutes without a deploy.
import { blogs as localBlogs, topics, type Blog } from "@/content/blogs";

const API = process.env.BLOG_API_URL ?? "https://trs-dashboard-pi.vercel.app/api/public/blog";
const SITE = "benefixe.com";
const REVALIDATE = 300;

type Remote = { slug: string; title: string; excerpt: string | null; topic: string | null; published_at: string; updated_at: string; reading_minutes: number; meta_description: string | null };
type RemoteOne = Remote & { content_html: string; headings: { id: string; text: string }[] };

export type Post = Blog & { html?: string; headings?: { id: string; text: string }[] };

const ICON_BY_TOPIC: Record<string, Blog["icon"]> = { "Group insurance": "pulse", Perks: "bag", Employers: "desk" };
const TONES: Blog["tone"][] = ["ember", "night", "surface"];

/** Two short lines for the cover from the title: whole words, about 18 characters each. */
export function coverLines(title: string): string[] {
  const words = title.replace(/[:?]/g, "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (lines.length === 2) break;
    if (cur && (cur + " " + w).length > 18) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (lines.length < 2 && cur) lines.push(cur);
  return lines;
}

function fromRemote(r: Remote, i: number): Post {
  const topic = (topics as string[]).includes(r.topic ?? "") ? (r.topic as Blog["topic"]) : "Blogs";
  return {
    slug: r.slug,
    title: r.title,
    dek: r.excerpt ?? r.meta_description ?? "",
    topic,
    published: r.published_at.slice(0, 10),
    updated: r.updated_at.slice(0, 10) !== r.published_at.slice(0, 10) ? r.updated_at.slice(0, 10) : undefined,
    minutes: r.reading_minutes,
    icon: ICON_BY_TOPIC[topic] ?? "book",
    tone: TONES[i % TONES.length],
    cover: coverLines(r.title),
    body: [],
  };
}

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
  const remote = (await get<{ articles: Remote[] }>(""))?.articles ?? [];
  const seen = new Set(remote.map(r => r.slug));
  const merged: Post[] = [...remote.map(fromRemote), ...localBlogs.filter(b => !seen.has(b.slug))];
  return merged.sort((a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0));
}

export async function getPost(slug: string): Promise<Post | undefined> {
  const one = (await get<{ article: RemoteOne }>(`&slug=${encodeURIComponent(slug)}`))?.article;
  if (one) return { ...fromRemote(one, 0), html: one.content_html, headings: one.headings };
  return localBlogs.find(b => b.slug === slug);
}

/** The feed's HTML split at the first paragraph, which the page sets above the cover. */
export function splitIntro(html: string): { intro: string; rest: string } {
  const i = html.indexOf("</p>");
  if (i < 0) return { intro: "", rest: html };
  return { intro: html.slice(0, i + 4), rest: html.slice(i + 4) };
}
