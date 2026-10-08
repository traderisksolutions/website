import Image from "next/image";
// Unsplash photo-1658615324653 ("looking up at trees and sky"), Unsplash License: free for
// commercial use, no attribution required. Forest canopy overhead: no place is identifiable.
import hero from "../../public/images/hero-canopy.jpg";
import { StartButton } from "./start-actions";

/** Full-bleed photo: the top two-thirds of the screen. The navbar floats over it, and the
 *  guide topic tabs sit on its bottom edge so the first row of guides fills the last third. */
export function Hero() {
  return (
    <section className="relative -mt-14 flex h-[max(440px,66.667svh)] items-end overflow-hidden bg-[#2c4a4f] text-white">
      <Image src={hero} alt="Looking up through a forest canopy" fill priority placeholder="blur" sizes="100vw" className="object-cover object-[50%_45%]" />
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(55%_60%_at_50%_68%,rgba(6,26,18,0.62),rgba(6,26,18,0.28)_65%,rgba(6,26,18,0.1)_100%)]" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-12 text-center sm:px-6 sm:pb-16">
        <h1 className="font-[family-name:var(--font-display)] [text-shadow:0_2px_30px_rgba(0,0,0,0.35)] text-[clamp(3rem,min(10vw,13svh),7.5rem)] font-light leading-[0.95] tracking-[-0.035em]">Corp Cover</h1>
        <p className="mt-3 max-w-[40ch] font-[family-name:var(--font-display)] text-[clamp(1.1rem,2.3vw,1.6rem)] font-light leading-snug tracking-[-0.01em] text-white [text-shadow:0_1px_14px_rgba(0,0,0,0.55)]">What it truly means to cover for your business</p>
        <StartButton className="mt-5 rounded-full bg-white px-7 py-3 font-semibold text-ink shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-transform hover:-translate-y-px" />
      </div>
    </section>
  );
}
