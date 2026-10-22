// Harvey solutions pattern: three columns, a quiet icon tile, a short title, two lines of text.
// Replaces pill chips; no borders, no cards.

const PATHS: Record<string, string> = {
  fee: "M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.6 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3",
  doc: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c1-3.6 4-5.5 7.5-5.5s6.5 1.9 7.5 5.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  shield: "M12 3l7 3v5c0 4.6-3 8.3-7 10-4-1.7-7-5.4-7-10V6z",
  chat: "M5 5h14v10H9l-4 4z",
  pin: "M12 21s-6-5.4-6-11a6 6 0 1 1 12 0c0 5.6-6 11-6 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  upload: "M12 16V4m0 0-4 4m4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3",
  check: "M5 12.5l4.5 4.5L19 7.5",
};

export type Feature = { icon: keyof typeof PATHS | string; title: string; text: string };

export function FeatureTrio({ items, className = "" }: { items: Feature[]; className?: string }) {
  return (
    <ul className={`ft ${className}`}>
      {items.map(f => (
        <li key={f.title}>
          <span className="ft-ico" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24"><path d={PATHS[f.icon] ?? PATHS.check} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <b>{f.title}</b>
          <span className="ft-text">{f.text}</span>
        </li>
      ))}
    </ul>
  );
}
