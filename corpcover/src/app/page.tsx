import { headers } from "next/headers";
import { redirect } from "next/navigation";

// corpcover.com/: sends each visitor to their market by country (Malaysia → /my, Hong Kong → /hk,
// everyone else → /sg). Temporary redirect, so the root stays the x-default in hreflang. Old ?start=
// links (newsletter emails) keep their parameters.
export default async function Root({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const country = (await headers()).get("x-vercel-ip-country") ?? "";
  const m = country === "MY" ? "my" : country === "HK" ? "hk" : "sg";
  const q = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map(x => [k, x]) : v ? [[k, v]] : [])) as [string, string][]).toString();
  redirect(`/${m}${q ? `?${q}` : ""}`);
}
