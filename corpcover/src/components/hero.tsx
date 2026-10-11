import Image, { type StaticImageData } from "next/image";
import { connection } from "next/server";
import type { CSSProperties } from "react";
import { StartButton } from "./start-actions";
// Sky and nature, no people. Unsplash License: free for commercial use, no attribution required.
// Sources: photo-1778630486048 (Dieny Portinanni), -1538051873369 (Jan Zikán),
// -1601205166564 (N Suma), -1526326313238 (Joshua Hoehne). Stored at 2560px wide.
import greenRidge from "../../public/images/hero/green-ridge.jpg";
import mistyHills from "../../public/images/hero/misty-hills.jpg";
import treeCanopy from "../../public/images/hero/tree-canopy.jpg";
import meadowSky from "../../public/images/hero/meadow-sky.jpg";

/** Open sky where the wordmark sits, at bottom left; `phone` is the crop on narrow screens. */
const photos: { src: StaticImageData; alt: string; focus: string; phone: string }[] = [
  { src: greenRidge, alt: "Green mountain under a clear blue sky", focus: "50% 15%", phone: "50% 50%" },
  { src: mistyHills, alt: "Misty hills under a pale morning sky", focus: "50% 50%", phone: "45% 50%" },
  { src: treeCanopy, alt: "Tree canopy against a blue sky", focus: "50% 50%", phone: "72% 50%" },
  { src: meadowSky, alt: "Grass hillside under a sky with soft clouds", focus: "50% 50%", phone: "60% 50%" },
];

/** One photo per request. Called only after connection(), so it never runs at build time. */
function pickPhoto() {
  return photos[Math.floor(Math.random() * photos.length)];
}

/** Full-bleed sky and nature photo over the top two-thirds of the screen; the navbar floats over it. */
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
        <StartButton className="hero-glass self-start px-8 py-3.5 text-[1.02rem] font-medium tracking-[-0.01em] lg:mb-3 lg:self-auto" />
      </div>
    </section>
  );
}
