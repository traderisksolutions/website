import type { ReactNode } from "react";

// Painted grounds after Werner Bronkhorst, one per page. Drawn by scripts/paint-terrain.py.
export type TerrainKind = "forest" | "jungle" | "football" | "tennis" | "golf" | "light";

/** Full-bleed painted ground that sits behind the navbar. Wraps the hero and its three benefits. */
export function Terrain({ kind, children }: { kind: TerrainKind; children: ReactNode }) {
  return <div className={`terrain terrain-${kind}${kind === "light" ? "" : " terrain-dark"}`}>{children}</div>;
}
