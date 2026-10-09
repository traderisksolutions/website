import Image, { type StaticImageData } from "next/image";
import { connection } from "next/server";
import type { CSSProperties } from "react";
import { StartButton } from "./start-actions";
// Daylight portraits and architecture against open sky. Unsplash License: free for commercial
// use, no attribution required. Sources: photo-1762344350011 (Zulfugar Karimov),
// -1617761141732 (Parrish Freeman), -1636308721961 (Nuno Antunes). Stored at 2560px wide.
import blazerSkyline from "../../public/images/hero/blazer-skyline.jpg";
import steppedGlass from "../../public/images/hero/stepped-glass.jpg";
import curvedRoof from "../../public/images/hero/curved-roof.jpg";

/** Subjects sit right of centre. The wordmark is capped at 9vw so it ends before them on wide
 *  screens; `phone` is the crop on narrow screens, where the photo is cut at the sides. */
const photos: { src: StaticImageData; alt: string; focus: string; phone: string }[] = [
  { src: blazerSkyline, alt: "Woman in a blazer under a clear sky", focus: "50% 25%", phone: "28% 30%" },
  { src: steppedGlass, alt: "Stepped glass tower against a blue sky", focus: "50% 60%", phone: "75% 50%" },
  { src: curvedRoof, alt: "Curved building facade against a blue sky", focus: "50% 50%", phone: "80% 50%" },
];

/** One photo per request. Called only after connection(), so it never runs at build time. */
function pickPhoto() {
  return photos[Math.floor(Math.random() * photos.length)];
}

/** Full-bleed daylight photo over the top two-thirds of the screen; the navbar floats over it. */
export async function Hero() {
  await connection(); // pick per request, not once at build time
  const p = pickPhoto();

  return (
    <section className="relative -mt-14 flex h-[max(460px,66.667svh)] items-end overflow-hidden bg-[#6f8fb5] text-white">
      <Image src={p.src} alt={p.alt} fill priority placeholder="blur" sizes="100vw" className="object-cover object-[var(--phone)] sm:object-[var(--focus)]" style={{ "--focus": p.focus, "--phone": p.phone } as CSSProperties} />
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(0deg,rgba(12,12,16,0.6)_0%,rgba(12,12,16,0.25)_35%,rgba(12,12,16,0)_60%)] sm:bg-[linear-gradient(15deg,rgba(12,12,16,0.55)_0%,rgba(12,12,16,0.2)_40%,rgba(12,12,16,0)_62%)]" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-10 sm:px-6 sm:pb-14 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-[clamp(3.4rem,min(9vw,16svh),8.75rem)] font-thin leading-[0.92] tracking-[-0.05em] max-sm:font-extralight">Corp Cover</h1>
          <p className="mt-3 max-w-[40ch] text-[clamp(1.05rem,1.9vw,1.4rem)] font-light leading-snug tracking-[-0.01em]">What it truly means to cover for your business</p>
        </div>
        <StartButton className="self-start rounded-full bg-white px-8 py-3.5 text-[1.02rem] font-medium tracking-[-0.01em] text-ink shadow-[0_10px_30px_rgba(0,0,0,0.18)] transition-transform hover:-translate-y-px motion-reduce:transition-none lg:mb-3 lg:self-auto" />
      </div>
    </section>
  );
}
