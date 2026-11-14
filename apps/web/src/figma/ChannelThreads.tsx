import { useState } from "react";
import { useApi, timeAgo } from "./live";
export type ThreadRoot = {
  id: string;
  author_id: string | null;
  author_name: string | null;
  parent_id: string | null;
  body: string;
  reply_count: number;
  reactions: Record<string, number>;
  my_reactions: string[];
  edited: boolean;
  deleted: boolean;
  created_at: string;
};

export function ChannelThreads({ channelId, onOpen }: { channelId: string; onOpen: (root: ThreadRoot) => void }) {
  const [page, setPage] = useState(1);
  const list = useApi<ThreadRoot[]>(`/channels/${channelId}/threads`, { page, limit: 20 });
  return (
    <section aria-label="Channel threads" className="grid gap-2">
      <h3>Threads</h3>
      {list.loading && <p>Loading threads…</p>}
      {!!list.error && (
        <p role="alert">
          Unable to load threads. <button onClick={list.reload}>Retry</button>
        </p>
      )}
      {!list.loading && !list.error && !list.data?.length && (
        <p>No threads yet. Reply to a channel message to start one.</p>
      )}
      {!list.error &&
        list.data?.map((m) => (
          <button className="rounded border p-3 text-left" key={m.id} onClick={() => onOpen(m)}>
            <b>{m.author_name || "Former member"}</b> · {timeAgo(m.created_at)}
            <p>{m.deleted ? "This message was deleted." : m.body}</p>
            <span>{m.reply_count} replies</span>
          </button>
        ))}
      <div className="flex gap-3">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>Page {page}</span>
        <button disabled={(list.data?.length ?? 0) < 20} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </section>
  );
}
