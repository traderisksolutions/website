// Guides come from two places: the TRS dashboard's public feed (articles approved in
// Marketing → Articles) and the hand-written entries in src/content/articles.ts. The feed wins
// on a slug both have; the local list keeps the site whole when the feed is empty or down.
// Fetched with ISR, so a newly approved article shows within five minutes without a deploy.
import { articles as localArticles, topics, type Article } from "@/content/articles";
import type { MarketKey } from "./market";

const API = process.env.BLOG_API_URL ?? "https://trs-dashboard-pi.vercel.app/api/public/blog";
const SITE = "corpcover.com";
const REVALIDATE = 300;

type Remote = { slug: string; market?: string; title: string; excerpt: string | null; topic: string | null; published_at: string; updated_at: string; reading_minutes: number; meta_description: string | null };
type RemoteOne = Remote & { content_html: string; headings: { id: string; text: string }[] };

/** A guide as the pages render it: a local Article, or a feed article carrying its HTML. */
export type Guide = Article & { market: MarketKey; html?: string; headings?: { id: string; text: string }[] };

const ART_BY_TOPIC: Record<string, Article["art"]> = { "Required by law": "hardhat", Liability: "umbrella", Property: "building", Directors: "gavel", Claims: "document" };

/** Up to three short lines for the cover card: the title's subject (before any colon), whole words, about 15 characters each. */
export function coverLines(title: string): string[] {
  const subject = title.split(":")[0].replace(/[?]/g, "");
  const words = subject.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > 15) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  const out = lines.slice(0, 3);
  // A cut title must not end on a joining word ("…the limits in").
  if (lines.length > 3) out[2] = out[2].replace(/\s+(in|and|the|for|of|to|a|an|with|on)$/i, "");
  return out;
}

function fromRemote(r: Remote, m: MarketKey): Guide {
  const topic = (topics as string[]).includes(r.topic ?? "") ? (r.topic as Article["topic"]) : "Guides";
  return {
    slug: r.slug,
    market: m,
    title: r.title,
    dek: r.excerpt ?? r.meta_description ?? "",
    topic,
    published: r.published_at.slice(0, 10),
    updated: r.updated_at.slice(0, 10) !== r.published_at.slice(0, 10) ? r.updated_at.slice(0, 10) : undefined,
    // The feed's reading time can undercount; never show less than the local copy of the same guide says.
    minutes: Math.max(r.reading_minutes, localArticles.find(l => l.slug === r.slug)?.minutes ?? 0),
    art: ART_BY_TOPIC[topic] ?? "document",
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

/** A market's guides: feed articles for that market, plus the hand-written ones (Singapore only). */
export async function getGuides(m: MarketKey = "sg"): Promise<Guide[]> {
  const remote = (await get<{ articles: Remote[] }>(`&market=${m.toUpperCase()}`))?.articles ?? [];
  const mine = remote.filter(r => (r.market ?? "SG").toLowerCase() === m);
  const seen = new Set(mine.map(r => r.slug));
  const local: Guide[] = m === "sg" ? localArticles.filter(a => !seen.has(a.slug)).map(a => ({ ...a, market: "sg" as const })) : [];
  const merged: Guide[] = [...mine.map(r => fromRemote(r, m)), ...local];
  return merged.sort((a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0));
}

export async function getGuide(slug: string, m: MarketKey = "sg"): Promise<Guide | undefined> {
  const one = (await get<{ article: RemoteOne }>(`&slug=${encodeURIComponent(slug)}`))?.article;
  if (one) return (one.market ?? "SG").toLowerCase() === m ? { ...fromRemote(one, m), html: one.content_html, headings: one.headings } : undefined;
  const local = m === "sg" ? localArticles.find(a => a.slug === slug) : undefined;
  return local ? { ...local, market: "sg" } : undefined;
}

/** The feed's HTML split at the first paragraph, which the page sets above the cover. */
export function splitIntro(html: string): { intro: string; rest: string } {
  const i = html.indexOf("</p>");
  if (i < 0) return { intro: "", rest: html };
  return { intro: html.slice(0, i + 4), rest: html.slice(i + 4) };
}
