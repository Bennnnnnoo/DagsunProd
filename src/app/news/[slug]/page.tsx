import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNewsPost, news } from "@/lib/data";

export function generateStaticParams() {
  return news.map((n) => ({ slug: n.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/news/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: getNewsPost(slug)?.title };
}

export default async function NewsPostPage({ params }: PageProps<"/news/[slug]">) {
  const { slug } = await params;
  const post = getNewsPost(slug);
  if (!post) notFound();

  return (
    <article>
      <h1>{post.title}</h1>
      <time dateTime={post.date}>{post.date}</time>
      <p>{post.body}</p>
    </article>
  );
}
