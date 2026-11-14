import { useRef, useState, type FormEvent } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { inputCls } from "./rap_kit";

interface SearchMessage {
  id: string;
  body: string;
  author_name: string | null;
  parent_id: string | null;
  created_at: string;
}
interface SearchPage {
  items: SearchMessage[];
  has_more: boolean;
}

/** Search is explicit, bounded, and scoped to the currently authorized channel. */
export function ChannelSearch({ channelId }: { channelId: string }) {
  const [draft, setDraft] = useState("");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const search = async (more = false) => {
    const query = more ? term : draft.trim();
    if (query.length < 2 || busy) return;
    const id = ++requestId.current;
    const last = more ? results?.items.at(-1) : undefined;
    setBusy(true);
    setError("");
    if (!more) {
      setTerm(query);
      setResults(null);
    }
    try {
      const { data } = await api.get<SearchPage>(`/channels/${channelId}/search`, {
        params: { q: query, limit: 25, before: last?.created_at, before_id: last?.id },
      });
      if (id !== requestId.current) return;
      setResults((previous) => ({
        items: more ? [...(previous?.items ?? []), ...data.items] : data.items,
        has_more: data.has_more,
      }));
    } catch (e) {
      if (id === requestId.current) {
        // Clear retained private results when authorization may have changed.
        setResults(null);
        setError(extractErrorMessage(e, "Search failed. Try again."));
      }
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  };
  const clear = () => {
    requestId.current++;
    setDraft("");
    setTerm("");
    setResults(null);
    setError("");
    setBusy(false);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void search();
  };
  return (
    <section aria-label="Search this channel" className="mb-4 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="min-w-40 flex-1 text-sm font-semibold">
          Search messages and threads
          <input className={inputCls} type="search" value={draft} maxLength={200}
            placeholder="Find a decision, name, or phrase…"
            onChange={(e) => setDraft(e.target.value)} />
        </label>
        <button className="rounded-lg bg-[#0552CC] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || draft.trim().length < 2} type="submit">{busy ? "Searching…" : "Search"}</button>
        {(term || error || busy) && <button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600" onClick={clear}>Clear search</button>}
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {results && <div className="mt-3" aria-live="polite">
        <p className="mb-2 text-sm text-slate-600">
          {results.items.length ? `${results.items.length}${results.has_more ? "+" : ""} matches for “${term}”` : `No messages match “${term}”.`}
        </p>
        <ol aria-label="Message search results" className="grid max-h-80 gap-2 overflow-y-auto">
          {results.items.map((message) => <li key={message.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <div className="mb-1 flex flex-wrap gap-x-2 text-xs text-slate-500">
              <b className="text-slate-700">{message.author_name || "Member"}</b>
              <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>
              {message.parent_id && <span>Thread reply</span>}
            </div>
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          </li>)}
        </ol>
        {results.has_more && <div className="mt-2"><button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold text-[#0552CC] disabled:opacity-50" disabled={busy} onClick={() => void search(true)}>Load more matches</button></div>}
      </div>}
    </section>
  );
}
