import { notFound } from "next/navigation";
import { isMarket, MARKET_KEYS } from "@/lib/market";

// /sg, /my and /hk, prebuilt. Any other first segment is a 404 (checked below). dynamicParams stays
// on: it is inherited by child segments, and articles from the feed render on demand.
export function generateStaticParams() { return MARKET_KEYS.map(market => ({ market })); }

export default async function MarketLayout({ children, params }: { children: React.ReactNode; params: Promise<{ market: string }> }) {
  if (!isMarket((await params).market)) notFound();
  return children;
}
