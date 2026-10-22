// FAQs as an accordion list (standing rule, 22 Oct 2026): question rows, one open at a time
// is not enforced; native <details> so it works without script and stays crawlable.
export function FaqList({ items, className = "" }: { items: { q: string; a: string; points?: string[] }[]; className?: string }) {
  return (
    <div className={`faq ${className}`}>
      {items.map(f => (
        <details key={f.q} className="faq-item">
          <summary><span>{f.q}</span><i aria-hidden /></summary>
          <div className="faq-a">
            <p>{f.a}</p>
            {f.points?.length ? <ul>{f.points.map(p => <li key={p}>{p}</li>)}</ul> : null}
          </div>
        </details>
      ))}
    </div>
  );
}
