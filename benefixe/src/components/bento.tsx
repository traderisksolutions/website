import Link from "next/link";
import { pass, perks, sgd } from "@/content";
import { PassCard } from "./pass-card";
import { PerkIcon } from "./perk-icon";

/** Hero bento: one tile per perk group, each showing the perk as a product surface. Figures are sample usage. */
function Tile({ label, href, dark, className = "", children }: { label: string; href: string; dark?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={`group relative flex min-h-[260px] flex-col overflow-hidden rounded-[18px] p-4 ${dark ? "bg-night text-white" : "tile tile-link"} ${className}`}>
      <div className="flex flex-1 items-center justify-center py-4">{children}</div>
      <div className={`flex items-center justify-between text-[13px] font-medium ${dark ? "text-white" : ""}`}>
        <span>{label}</span>
        <span className={`transition-transform group-hover:translate-x-0.5 ${dark ? "text-white/70" : "text-ink-2"}`}>Explore →</span>
      </div>
    </Link>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`w-full max-w-[290px] rounded-2xl bg-paper p-4 shadow-[0_1px_2px_rgba(0,0,0,.04),0_0_0_1px_rgba(10,10,10,.05)] ${className}`}>{children}</div>;
}

function Bar({ value, max }: { value: number; max: number }) {
  return <div className="h-1.5 rounded-full bg-ink/8"><div className="h-full rounded-full bg-ink" style={{ width: `${(value / max) * 100}%` }} /></div>;
}

export function Bento() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Tile label="Travel" href="/perks#travel">
        <Panel>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[13px] font-medium"><PerkIcon name="sim" className="size-4" /> eSIM · Tokyo</span>
            <span className="flex items-center gap-1.5 text-[11px] text-ink-2"><span className="size-1.5 rounded-full bg-emerald-500" />Connected</span>
          </div>
          <div className="mt-5 flex items-baseline justify-between">
            <span className="text-2xl font-medium tabular-nums tracking-[-0.02em]">6.2 <span className="text-sm text-ink-3">/ 10 GB</span></span>
            <span className="mono-label">Oct</span>
          </div>
          <div className="mt-2"><Bar value={6.2} max={10} /></div>
          <div className="mt-4 flex justify-between border-t border-rule pt-3 text-[12px] text-ink-2"><span>Lounge visits</span><span className="tabular-nums text-ink">1 / 4</span></div>
        </Panel>
      </Tile>

      <Tile label="Insider Pass" href="#membership" dark>
        <div className="ember grain w-full max-w-[320px] rounded-2xl p-5"><PassCard /></div>
      </Tile>

      <Tile label="Move" href="/perks#move">
        <Panel>
          <div className="flex items-center gap-2 text-[13px] font-medium"><PerkIcon name="bike" className="size-4" /> Bike rental</div>
          <div className="mt-5 flex items-baseline justify-between">
            <span className="text-2xl font-medium tabular-nums tracking-[-0.02em]">42 <span className="text-sm text-ink-3">/ 60 min</span></span>
            <span className="mono-label">Today</span>
          </div>
          <div className="mt-2"><Bar value={42} max={60} /></div>
          <div className="mt-4 flex justify-between border-t border-rule pt-3 text-[12px] text-ink-2"><span>Car share credit</span><span className="tabular-nums text-ink">S$18 / S$30</span></div>
        </Panel>
      </Tile>

      <Tile label="Wellness" href="/perks#wellness" className="md:col-span-2">
        <Panel className="max-w-[440px]">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[13px] font-medium"><PerkIcon name="dumbbell" className="size-4" /> Classes</span>
            <span className="text-[12px] tabular-nums text-ink-2">4 / 6 this month</span>
          </div>
          <ul className="mt-3 divide-y divide-rule text-[13px]">
            {[["Mon 07:00", "Spin · Tanjong Pagar", "Booked"], ["Wed 18:30", "Yoga · Raffles Place", "Booked"], ["Sat 09:00", "Pilates · Tiong Bahru", "Open"]].map(([t, c, s]) => (
              <li key={t} className="flex items-center justify-between gap-3 py-2.5">
                <span className="w-20 shrink-0 font-mono text-[11px] text-ink-3">{t}</span>
                <span className="flex-1 truncate">{c}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${s === "Booked" ? "bg-ink text-white" : "bg-ink/6 text-ink-2"}`}>{s}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </Tile>

      <Tile label="Everyday" href="/perks#everyday">
        <Panel>
          <div className="flex items-center gap-2 text-[13px] font-medium"><PerkIcon name="coffee" className="size-4" /> Coffee</div>
          <div className="mt-4 grid grid-cols-6 gap-1.5">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} className={`aspect-square rounded-md ${i < 5 ? "bg-ink" : "bg-ink/7"}`} />
            ))}
          </div>
          <div className="mt-4 flex justify-between border-t border-rule pt-3 text-[12px] text-ink-2"><span>Co-working</span><span className="tabular-nums text-ink">1 pass left</span></div>
        </Panel>
      </Tile>
    </div>
  );
}

export function PassStats({ dark }: { dark?: boolean }) {
  const items = [
    [String(perks.length), "Perks"],
    [sgd(pass.totalValue), "Retail value a year"],
    [sgd(pass.priceYear), "Membership a year"],
  ];
  return (
    <dl className={`flex divide-x ${dark ? "divide-white/15" : "divide-rule"}`}>
      {items.map(([v, l]) => (
        <div key={l} className="px-5 first:pl-0">
          <dd className="text-[15px] font-medium tabular-nums">{v}</dd>
          <dt className={`mt-0.5 text-[12px] ${dark ? "text-white/45" : "text-ink-3"}`}>{l}</dt>
        </div>
      ))}
    </dl>
  );
}
