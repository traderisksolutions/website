import { Contours } from "@/components/contours";
import { Lockup } from "@/components/wordmark";
import { site } from "@/site";

/** Shown on every URL while site.holding is true: lockup 3 on Abyss, registered names, one status line. */
export function Holding() {
  return (
    <main className="holding">
      <Contours at="sides" tone="dark" />
      <div className="holding-mark"><Lockup /></div>
      <p className="holding-status">Website in preparation.</p>
      <p className="holding-reg"><span lang="zh-Hant">{site.nameZh}</span><span>{site.entity}</span></p>
    </main>
  );
}
