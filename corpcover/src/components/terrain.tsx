import type { ReactNode } from "react";

// Page grounds use the three landing-card shades (globals.css .grain-*), so every page matches the home service cards.
export type Shade = "evergreen" | "moss" | "pine";

/** Full-bleed grain ground that sits behind the navbar. Wraps the hero and its three benefits. */
export function Terrain({ shade, children }: { shade: Shade; children: ReactNode }) {
  return <div className={`terrain terrain-dark grain grain-${shade}`}>{children}</div>;
}
