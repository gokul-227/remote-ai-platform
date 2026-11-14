import { useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { safeHref, useApi } from "./live";

export type Attachment = { id: string; name: string; size: number; mime: string | null };
type FileRow = Attachment & { kind: string; current_version: number };

export function AttachmentPicker({
  selected,
  onChange,
  disabled,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [parents, setParents] = useState<(string | null)[]>([]);
  const files = useApi<FileRow[]>(open ? "/files" : null, { parent_id: folder || undefined, limit: 200 });
  return (
    <div className="my-2 text-sm">
      <button type="button" disabled={disabled} onClick={() => setOpen(!open)}>
        Attach from Files ({selected.length}/10)
      </button>
      {open && (
        <div className="grid max-h-60 gap-2 overflow-auto rounded border p-3" aria-label="Choose attachments">
          <p>Recipients need access in Files. Manage sharing there before sending.</p>
          {parents.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setFolder(parents[parents.length - 1]);
                setParents(parents.slice(0, -1));
              }}
            >
              Parent folder
            </button>
          )}
          {files.loading && <p>Loading files…</p>}
          {!!files.error && (
            <p role="alert">
              Files could not be loaded.{" "}
              <button type="button" onClick={files.reload}>
                Retry
              </button>
            </p>
          )}
          {!files.error &&
            files.data?.map((f) =>
              f.kind === "folder" ? (
                <button
                  type="button"
                  key={f.id}
                  onClick={() => {
                    setParents([...parents, folder]);
                    setFolder(f.id);
                  }}
                >
                  {f.name} /
                </button>
              ) : (
                <label key={f.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(f.id)}
                    disabled={disabled || !f.current_version || (!selected.includes(f.id) && selected.length >= 10)}
                    onChange={(e) =>
                      onChange(e.target.checked ? [...selected, f.id] : selected.filter((id) => id !== f.id))
                    }
                  />{" "}
                  {f.name}
                </label>
              ),
            )}
          {!files.loading && !files.error && !files.data?.length && <p>No files in this folder.</p>}
          <a href="#files">Open Files to upload or share</a>
        </div>
      )}
    </div>
  );
}

export function MessageAttachments({
  channelId,
  conversationId,
  messageId,
  attachments,
}: {
  channelId?: string;
  conversationId?: string;
  messageId: string;
  attachments?: Attachment[];
}) {
  const [error, setError] = useState("");
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);
  async function prepare(id: string) {
    setLink(null);
    try {
      const r = await api.get<{ url: string }>(
        `${conversationId ? `/conversations/${conversationId}` : `/channels/${channelId}`}/messages/${messageId}/attachments/${id}/download`,
      );
      const url = safeHref(r.data.url);
      if (!url) throw new Error("Download unavailable");
      setLink({ id, url });
      setError("");
    } catch (e) {
      setError(extractErrorMessage(e, "File is no longer available to you."));
    }
  }
  return (
    <div className="grid gap-1 text-xs">
      {attachments?.map((f) => (
        <div key={f.id}>
          <button type="button" className="underline" onClick={() => prepare(f.id)}>
            {f.name} ({Math.ceil(f.size / 1024)} KB)
          </button>
          {link?.id === f.id && (
            <a className="ml-2 underline" href={link.url} target="_blank" rel="noopener noreferrer">
              Download file
            </a>
          )}
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
