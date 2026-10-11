import Link from "next/link";
import { formatDate, type Blog } from "@/content/blogs";
import { BlogCover } from "./blog-cover";

export function BlogMeta({ blog }: { blog: Blog }) {
  return <p className="mono-label mt-2">{formatDate(blog.published)} · {blog.minutes} min read</p>;
}

export function BlogCard({ blog }: { blog: Blog }) {
  return (
    <Link href={`/blogs/${blog.slug}`} className="group flex flex-col">
      <div className="aspect-[16/10] overflow-hidden rounded-[14px]">
        <div className="h-full transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"><BlogCover blog={blog} /></div>
      </div>
      <h3 className="mt-4 text-[17px] font-medium leading-snug tracking-[-0.01em] group-hover:underline">{blog.title}</h3>
      <p className="mt-1 line-clamp-2 text-[14px] text-ink-2">{blog.dek}</p>
      <BlogMeta blog={blog} />
    </Link>
  );
}
