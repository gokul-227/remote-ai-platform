import { useState } from "react";
import { Ic, Tag } from "./rap_kit";
import { useApi, timeAgo, safeHref } from "./live";

type NewsItem = {
  id: string;
  title: string;
  excerpt?: string | null;
  url: string;
  discussion_url?: string | null;
  tags: string[];
  published_at: string;
  source: { name: string; label: string; homepage?: string | null };
};

/**
 * "From around the web": public links from outside sources, attributed and
 * linked to the original. Never shown as member posts: no author, reactions or
 * comments, and every item says where it comes from.
 */
export function ExternalReading() {
  const [page, setPage] = useState(1);
  const feed = useApi<{ items: NewsItem[]; has_more: boolean }>("/social/external", { page, page_size: 20 });
  const items = feed.data?.items ?? [];
  return (
    <section aria-label="From around the web" className="space-y-3">
      <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
        <Ic n="globe" s={14} c="inline mr-1" />
        Links from public sources outside Remote AI Platform. They are not posts by members; each one opens the original
        site.
      </p>
      {!!feed.error && (
        <div role="alert">
          Couldn’t load external reading.{" "}
          <button type="button" onClick={feed.reload}>
            Retry
          </button>
        </div>
      )}
      {feed.loading && !feed.data && <div className="rap-panel p-8 text-center text-slate-500">Loading…</div>}
      {items.map((it) => {
        const href = safeHref(it.url);
        const discussion = safeHref(it.discussion_url);
        const home = safeHref(it.source.homepage);
        return (
          <article key={it.id} className="rap-panel p-5" data-external="true">
            <p className="text-xs text-slate-500">
              <Tag v="gray">External</Tag>{" "}
              {home ? (
                <a href={home} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
                  {it.source.label}
                </a>
              ) : (
                it.source.label
              )}{" "}
              · {timeAgo(it.published_at)}
            </p>
            <h3 className="mt-1 text-base font-semibold">
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
                  {it.title}
                </a>
              ) : (
                it.title
              )}
            </h3>
            {it.excerpt && <p className="mt-1 text-sm text-slate-600">{it.excerpt}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              {it.tags.slice(0, 4).map((t) => (
                <Tag key={t} v="gray">
                  {t}
                </Tag>
              ))}
              {href && (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-semibold text-blue-600"
                >
                  Read on {it.source.label}
                </a>
              )}
              {discussion && (
                <a href={discussion} target="_blank" rel="noopener noreferrer nofollow" className="text-blue-600">
                  Discussion
                </a>
              )}
            </div>
          </article>
        );
      })}
      {!feed.loading && !feed.error && !items.length && (
        <div className="rap-panel v2-empty">
          <Ic n="globe" s={36} c="mx-auto" />
          <h3>Nothing from around the web yet</h3>
          <p>External reading appears here once a source has been imported. Member posts are on the other tab.</p>
        </div>
      )}
      {(page > 1 || feed.data?.has_more) && (
        <nav aria-label="External reading pages" className="flex items-center justify-center gap-4 py-5">
          <button type="button" disabled={page === 1 || feed.loading} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <button type="button" disabled={!feed.data?.has_more || feed.loading} onClick={() => setPage(page + 1)}>
            More from around the web
          </button>
        </nav>
      )}
    </section>
  );
}
