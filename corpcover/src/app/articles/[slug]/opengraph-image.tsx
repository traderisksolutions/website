import { ImageResponse } from "next/og";
import { articles, bySlug } from "@/content/articles";
import { site } from "@/site";
import { og, ogContentType, ogFonts, ogSize } from "@/lib/og";

export const alt = `${site.name} guide`;
export const size = ogSize;
export const contentType = ogContentType;
export const dynamicParams = false;

export function generateStaticParams() {
  return articles.map(a => ({ slug: a.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const a = bySlug((await params).slug);
  if (!a) return new Response("Not found", { status: 404 });
  const titleSize = a.title.length > 40 ? 68 : 80;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: og.bg, fontFamily: "Inter" }}>
        <div style={{ width: 24, background: og.accent }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "60px 72px" }}>
          <div style={{ fontWeight: 300, fontSize: 44, lineHeight: 1, letterSpacing: -1.76, color: og.ink }}>{site.name}</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex" }}>
              <div style={{ background: og.accent, color: "#FFFFFF", fontWeight: 700, fontSize: 22, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 16px" }}>{a.topic}</div>
            </div>
            <div style={{ marginTop: 28, maxWidth: 960, fontWeight: 700, fontSize: titleSize, lineHeight: 1.08, letterSpacing: "-0.03em", color: og.ink }}>{a.title}</div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
