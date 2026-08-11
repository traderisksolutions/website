// Word-set Jaccard similarity — robust to insertions/reordering (unlike positional char
// match, where a single early edit tanks the score). Shared by eval scoring (skip the judge
// call when the human sent the draft essentially as-is) and example dedup (don't store a
// near-identical few-shot example we already have).
function wordSet(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean))
}

export function wordJaccard(a: string, b: string): number {
  const sa = wordSet(a), sb = wordSet(b)
  if (sa.size === 0 && sb.size === 0) return 1
  let inter = 0
  for (const w of Array.from(sa)) if (sb.has(w)) inter++
  const union = sa.size + sb.size - inter
  return union > 0 ? inter / union : 1
}
