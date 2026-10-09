import { ImageResponse } from "next/og";
import { site } from "@/site";
import { og, ogContentType, ogFonts, ogSize } from "@/lib/og";

export const alt = `${site.name}. Plain guides to business insurance`;
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: og.bg, fontFamily: "Inter" }}>
        <div style={{ width: 24, background: og.accent }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px" }}>
          <div style={{ fontWeight: 700, fontSize: 22, letterSpacing: "0.08em", textTransform: "uppercase", color: og.ink2 }}>{site.domain}</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontWeight: 300, fontSize: 150, lineHeight: 1, letterSpacing: -6, color: og.ink }}>{site.name}</div>
            <div style={{ marginTop: 32, width: 96, height: 6, background: og.accent }} />
            <div style={{ marginTop: 32, fontWeight: 700, fontSize: 46, lineHeight: 1.15, letterSpacing: "-0.02em", color: og.ink }}>Plain guides to business insurance</div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
