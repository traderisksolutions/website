import Image, { type StaticImageData } from "next/image";
import { connection } from "next/server";
import { StartButton } from "./start-actions";
// Skylines at dusk and night. All Unsplash License: free for commercial use, no attribution
// required. Sources: photo-1602815403836, -1496939376851, -1566914447826, -1736296981757,
// -1523731407965, -1736737657325. Stored at their original resolution (up to 5120px).
import hongKong from "../../public/images/skylines/hong-kong.jpg";
import singapore from "../../public/images/skylines/singapore.jpg";
import kualaLumpur from "../../public/images/skylines/kuala-lumpur.jpg";
import jakarta from "../../public/images/skylines/jakarta.jpg";
import bangkok from "../../public/images/skylines/bangkok.jpg";
import hoChiMinh from "../../public/images/skylines/ho-chi-minh-city.jpg";

const skylines: { city: string; src: StaticImageData; focus: string }[] = [
  { city: "Hong Kong", src: hongKong, focus: "50% 70%" },
  { city: "Singapore", src: singapore, focus: "55% 75%" },
  { city: "Kuala Lumpur", src: kualaLumpur, focus: "50% 45%" },
  { city: "Jakarta", src: jakarta, focus: "50% 60%" },
  { city: "Bangkok", src: bangkok, focus: "50% 60%" },
  { city: "Ho Chi Minh City", src: hoChiMinh, focus: "50% 60%" },
];

/** One skyline per request. Called only after connection(), so it never runs at build time. */
function pickSkyline() {
  return skylines[Math.floor(Math.random() * skylines.length)];
}

/** Full-bleed photo: the top two-thirds of the screen, a different city each visit.
 *  The navbar floats over it. */
export async function Hero() {
  await connection(); // pick per request, not once at build time
  const s = pickSkyline();

  return (
    <section className="relative -mt-14 flex h-[max(440px,66.667svh)] items-end overflow-hidden bg-[#1b2a33] text-white">
      <Image src={s.src} alt={`${s.city} skyline`} fill priority placeholder="blur" sizes="100vw" className="object-cover" style={{ objectPosition: s.focus }} />
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_66%,rgba(8,14,24,0.55),rgba(8,14,24,0.22)_65%,rgba(8,14,24,0.05)_100%),linear-gradient(180deg,rgba(8,14,24,0.35)_0%,rgba(8,14,24,0)_22%)]" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-12 text-center sm:px-6 sm:pb-16">
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(3rem,min(10vw,13svh),7.5rem)] font-light leading-[0.95] tracking-[-0.035em] [text-shadow:0_2px_30px_rgba(0,0,0,0.35)]">Corp Cover</h1>
        <p className="mt-3 max-w-[40ch] font-[family-name:var(--font-display)] text-[clamp(1.1rem,2.3vw,1.6rem)] font-light leading-snug tracking-[-0.01em] text-white [text-shadow:0_1px_14px_rgba(0,0,0,0.55)]">What it truly means to cover for your business</p>
        <StartButton className="hero-glass mt-6 px-8 py-3.5 text-[1.02rem] font-semibold tracking-[-0.005em]" />
      </div>
      <p className="absolute bottom-4 right-5 text-[0.7rem] font-medium uppercase tracking-[0.18em] text-white/80 [text-shadow:0_1px_6px_rgba(0,0,0,0.7)] sm:bottom-5 sm:right-7">{s.city}</p>
    </section>
  );
}
