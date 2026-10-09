// Answers the chat gives without the model: the matching FAQ answer or guide, else the adviser.
import { articles } from "@/content/articles";
import { faqs, type Faq } from "@/content/faq";

/** One FAQ answer as chat text: the short answer, then its points as "- " bullets. */
export const faqAnswer = (f: Faq) => [f.a, ...f.points.map(p => `- ${p}`)].join("\n");

/* ── Local answers, used when the model is not configured or fails ── */

const words = (s: string) => s.toLowerCase().match(/[a-z0-9$]+/g) ?? [];
const STOP = new Set(["the", "a", "an", "i", "my", "do", "does", "is", "are", "to", "of", "for", "and", "or", "in", "on", "it", "what", "how", "can", "you", "your", "we", "our", "me", "be", "have", "with", "about", "which", "who", "will", "need"]);
const keys = (s: string) => new Set(words(s).filter(w => !STOP.has(w) && w.length > 1));

// Guide titles count double: a question naming a policy should land on its guide, not the FAQ.
const entries = [
  ...faqs.map(f => ({ keys: keys(`${f.q} ${f.a} ${f.points.join(" ")}`), title: keys(f.q), answer: faqAnswer(f) })),
  ...articles.map(a => {
    const intro = a.body.find(b => b.type === "p");
    return { keys: keys(`${a.title} ${a.dek} ${a.topic}`), title: keys(a.title), answer: `${intro && intro.type === "p" ? intro.text : a.dek}\n- Guide: ${a.title}, ${a.minutes} min read.\n- An adviser can check how it applies to your company.` };
  }),
];

export const NO_MATCH = "An adviser can answer that one. Use WhatsApp or request a callback below.";

/** Best FAQ or guide match by shared keywords; the adviser hand-off when nothing matches. */
export function localAnswer(question: string): string {
  const q = keys(question);
  let best = { score: 0, answer: NO_MATCH };
  for (const e of entries) {
    let score = 0;
    for (const w of q) score += e.title.has(w) ? 2 : e.keys.has(w) ? 1 : 0;
    if (score > best.score) best = { score, answer: e.answer };
  }
  return best.score >= 1 ? best.answer : NO_MATCH;
}
