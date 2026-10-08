import Image from "next/image";
// Unsplash photo-1475767239063 ("landscape photography of mountains"), Unsplash License:
// free for commercial use, no attribution required. No place or landmark is identifiable.
import hero from "../../public/images/hero-mountains.jpg";
import { StartButton } from "./start-actions";

/** Full-bleed photo band, kept to the top third of the screen so the first row of guides
 *  shows on the first screen. The navbar floats over it. */
export function Hero() {
  return (
    <section className="relative -mt-14 flex h-[max(300px,36svh)] items-end overflow-hidden text-white">
      <Image src={hero} alt="Mountain ridges in morning haze" fill priority placeholder="blur" sizes="100vw" className="object-cover object-[50%_40%]" />
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(70%_90%_at_50%_70%,rgba(8,30,34,0.42),rgba(8,30,34,0.12)_70%,rgba(8,30,34,0)_100%)]" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-6 text-center sm:px-6 sm:pb-8">
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.7rem,min(8vw,9svh),5.6rem)] font-light leading-[0.95] tracking-[-0.035em]">Corp Cover</h1>
        <p className="mt-3 max-w-[40ch] font-[family-name:var(--font-display)] text-[clamp(1.1rem,2.3vw,1.6rem)] font-light leading-snug tracking-[-0.01em] text-white/90">What it truly means to cover for your business</p>
        <StartButton className="mt-5 rounded-full bg-white px-7 py-3 font-semibold text-ink shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-transform hover:-translate-y-px" />
      </div>
    </section>
  );
}
