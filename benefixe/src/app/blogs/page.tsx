import type { Metadata } from "next";
import { Suspense } from "react";
import { BlogFeed, BlogFeedFromUrl } from "@/components/blog-feed";
import { getPosts } from "@/lib/blog-api";

export const metadata: Metadata = { title: "Blogs", description: "Guides to group insurance, employee perks and benefits plans in Singapore.", alternates: { canonical: "/blogs" } };

export const revalidate = 300;

export default async function Blogs() {
  const blogs = await getPosts();
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-14 sm:px-6 md:pt-20">
      <div className="flex items-end justify-between gap-4">
        <h1 className="h-display text-[2.6rem] sm:text-6xl">Blogs</h1>
        <p className="mono-label pb-2">{blogs.length} blogs</p>
      </div>
      <div className="mt-10">
        <Suspense fallback={<BlogFeed blogs={blogs} />}><BlogFeedFromUrl blogs={blogs} /></Suspense>
      </div>
    </main>
  );
}
