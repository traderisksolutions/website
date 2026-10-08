import Image from "next/image";
import hero from "../../public/images/hero-cbd.jpg";
import { site } from "@/site";
import { insurers } from "@/content/faq";

/** Full-bleed photo hero (KAST layout): image edge to edge, the navbar floats over it. */
export function Hero() {
  return (
    <section className="relative -mt-14 flex min-h-[600px] items-end overflow-hidden text-white sm:h-[min(94svh,880px)]">
      <Image src={hero} alt="Singapore's Central Business District under a blue sky" fill priority placeholder="blur" sizes="100vw" className="object-cover object-[55%_75%]" />
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,24,40,0.55)_0%,rgba(6,24,40,0.18)_55%,rgba(6,24,40,0)_80%),linear-gradient(0deg,rgba(6,24,40,0.55)_0%,rgba(6,24,40,0)_45%)]" />
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-14 pt-32 sm:px-6 sm:pb-20">
        <h1 className="font-[family-name:var(--font-display)] font-light">
          <span className="block text-[clamp(3.2rem,10vw,7.5rem)] leading-[0.95] tracking-[-0.035em]">Business cover</span>
          <span className="mt-3 block text-[clamp(1.5rem,3.6vw,2.6rem)] leading-tight tracking-[-0.02em]">compared across {insurers.length} insurers</span>
        </h1>
        <p className="mt-5 max-w-[40ch] text-[1.08rem] leading-relaxed text-white/85">MAS-licensed advisers compare quotes for Singapore companies. No fee, and no obligation to buy.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#start" className="rounded-full bg-white px-6 py-3 font-semibold text-ink shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-transform hover:-translate-y-px">Get started</a>
          <a href={`tel:+65${site.phone.replace(/\s/g, "")}`} className="hero-glass px-6 py-3 font-medium">Call {site.phone}</a>
        </div>
      </div>
    </section>
  );
}

/** Insurer names in place of KAST's partner logos. Plain names: no logos are used without permission. */
export function InsurerStrip() {
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-12 pr-12 sm:gap-16 sm:pr-16">
      {insurers.map(n => <li key={n} className="whitespace-nowrap text-[1.35rem] font-bold tracking-[-0.02em] text-ink/75 sm:text-[1.6rem]">{n}</li>)}
    </ul>
  );
  return (
    <section aria-label={`Insurers our partners broker for: ${insurers.join(", ")}`} className="overflow-hidden bg-[#ecebe7] py-7 sm:py-9">
      <div className="marquee">{row(false)}{row(true)}</div>
    </section>
  );
}
