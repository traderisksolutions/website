// Shared pieces for the generated sharing images (next/og). next/og cannot load system Helvetica,
// so the images use Inter (latin subset, weights 300 and 700) from assets/fonts.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

export const og = { bg: "#F4F3F2", accent: "#7A1F2E", ink: "#1A1A1C", ink2: "#6B6B70" };

const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));

export async function ogFonts() {
  const [light, bold] = await Promise.all([font("Inter-Light.woff"), font("Inter-Bold.woff")]);
  return [
    { name: "Inter", data: light, style: "normal" as const, weight: 300 as const },
    { name: "Inter", data: bold, style: "normal" as const, weight: 700 as const },
  ];
}
