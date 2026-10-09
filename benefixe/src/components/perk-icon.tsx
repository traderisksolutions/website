import type { IconName } from "@/content";

// 24px stroke glyphs, one per perk. currentColor so the tile sets the tone.
const paths: Record<IconName, React.ReactNode> = {
  sim: <><path d="M7 3h7l4 4v14H7z" /><rect x="10" y="11" width="5" height="6" rx="1" /></>,
  lounge: <><path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" /><path d="M3 11h18v5H3z" /><path d="M6 16v3M18 16v3" /></>,
  hotel: <><path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-8v6" /><circle cx="6.5" cy="11.5" r="1.5" /></>,
  bike: <><circle cx="6" cy="16" r="3.5" /><circle cx="18" cy="16" r="3.5" /><path d="M6 16l4-7h5l3 7M10 9l3 7M14 6h2" /></>,
  car: <><path d="M5 16V12l2-5h10l2 5v4z" /><path d="M5 12h14" /><circle cx="8" cy="16" r="1.5" /><circle cx="16" cy="16" r="1.5" /></>,
  taxi: <><path d="M3 15l4-1 3-6h4l2 6 5 1" /><path d="M2 18h20" /><path d="M10 8V5h4v3" /></>,
  dumbbell: <><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" /></>,
  mind: <><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></>,
  tooth: <><path d="M7 4c-2 0-3 1.8-3 4 0 3 1.5 4 2 7l1 5h2l1.5-5h3L15 20h2l1-5c.5-3 2-4 2-7 0-2.2-1-4-3-4-2 0-3 1-5 1S9 4 7 4z" /></>,
  pulse: <><path d="M3 12h4l2-5 4 10 2-5h6" /></>,
  physio: <><circle cx="12" cy="5" r="2" /><path d="M12 7v6l-4 7M12 13l4 7M7 10h10" /></>,
  moon: <><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></>,
  bag: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  coffee: <><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3" /></>,
  desk: <><rect x="4" y="4" width="16" height="11" rx="1.5" /><path d="M9 19h6M12 15v4" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z" /><path d="M4 20a2 2 0 0 1 2-2h13v3H6" /></>,
  phone: <><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></>,
  shirt: <><path d="M8 3l-5 3 2 4 3-1v12h8V9l3 1 2-4-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z" /></>,
};

export function PerkIcon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  );
}
