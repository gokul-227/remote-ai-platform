import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionLink, PublicFrame } from "../../PublicChrome";
import { fetchPost, ldJson } from "@/lib/publicPages";
import { SITE_URL, summary } from "@/lib/site";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await fetchPost((await params).id);
  if (!p) return { title: "Post not found | Remote AI Platform", robots: { index: false } };
  const by = p.author.name || "A member";
  const title = `${by} on Remote AI Platform: “${summary(p.content, 60)}”`;
  return {
    title,
    description: summary(p.content),
    alternates: { canonical: `/posts/${p.id}` },
    openGraph: { title, description: summary(p.content), type: "article", url: `/posts/${p.id}` },
  };
}

export default async function PostPage({ params }: Props) {
  const p = await fetchPost((await params).id);
  if (!p) notFound();
  const by = p.author.name || "A member";
  return (
    <PublicFrame>
      <article className="rounded-xl border border-slate-200 bg-white p-6">
        <header className="mb-4">
          {p.author.profile_id ? (
            <Link href={`/people/${p.author.profile_id}`} className="font-bold hover:underline">
              {by}
            </Link>
          ) : (
            <b>{by}</b>
          )}
          {p.author.headline && <p className="text-sm text-slate-600">{p.author.headline}</p>}
          <p className="text-xs text-slate-500">{new Date(p.created_at).toISOString().slice(0, 10)}</p>
        </header>
        <p className="whitespace-pre-line text-[17px]">{p.content}</p>
        <p className="mt-4 text-sm text-slate-500">
          {p.like_count} likes · {p.comment_count} comments
        </p>
        <div className="mt-4 flex gap-2">
          <ActionLink href="/#feed" primary>
            Like
          </ActionLink>
          <ActionLink href="/#feed">Comment</ActionLink>
        </div>
      </article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson({
            "@context": "https://schema.org",
            "@type": "SocialMediaPosting",
            headline: summary(p.content, 110),
            articleBody: p.content,
            datePublished: p.created_at,
            url: `${SITE_URL}/posts/${p.id}`,
            author: {
              "@type": "Person",
              name: by,
              url: p.author.profile_id ? `${SITE_URL}/people/${p.author.profile_id}` : undefined,
            },
            interactionStatistic: [
              {
                "@type": "InteractionCounter",
                interactionType: "https://schema.org/LikeAction",
                userInteractionCount: p.like_count,
              },
              {
                "@type": "InteractionCounter",
                interactionType: "https://schema.org/CommentAction",
                userInteractionCount: p.comment_count,
              },
            ],
          }),
        }}
      />
    </PublicFrame>
  );
}
