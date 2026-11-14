import { useCallback, useEffect, useRef, useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";

type DraftDocument = { id: string; version: number; title: string; content: unknown };

// Serialize saves and keep edits made during a request pending for the next revision.
export function useDocumentDraft<T extends DraftDocument>(initial: T, editable: boolean) {
  const [doc, setDoc] = useState(initial);
  const current = useRef(initial);
  const latest = useRef({ title: initial.title, content: initial.content });
  const revision = useRef(0);
  const locked = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState("");
  const [editTick, setEditTick] = useState(0);
  const change = useCallback((patch: Partial<Pick<T, "title" | "content">>) => {
    latest.current = { ...latest.current, ...patch };
    revision.current += 1;
    setEditTick(revision.current);
    setDirty(true);
    setPaused(false);
    setStatus("Unsaved changes");
  }, []);
  const save = useCallback(async () => {
    if (!editable || locked.current || conflict) return;
    locked.current = true;
    setSaving(true);
    const submitted = revision.current;
    setStatus("Saving…");
    try {
      const response = await api.put<T>(`/documents/${current.current.id}`, {
        expected_version: current.current.version,
        ...latest.current,
      });
      current.current = response.data;
      setDoc(response.data);
      const pending = revision.current !== submitted;
      setDirty(pending);
      setStatus(pending ? "Unsaved changes" : "All changes saved");
    } catch (error) {
      setPaused(true);
      const stale = (error as { response?: { status?: number } })?.response?.status === 409;
      setConflict(stale);
      setStatus(
        stale
          ? "Newer version available; your draft has not been overwritten."
          : extractErrorMessage(error, "Not saved. Try again."),
      );
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }, [editable, conflict]);
  useEffect(() => {
    if (!dirty || saving || conflict || paused) return;
    const timer = window.setTimeout(save, 2000);
    return () => window.clearTimeout(timer);
  }, [dirty, saving, conflict, paused, save, editTick]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const replace = (replacement: T) => {
    current.current = replacement;
    latest.current = { title: replacement.title, content: replacement.content };
    revision.current += 1;
    setDoc(replacement);
    setDirty(false);
    setConflict(false);
    setPaused(false);
    setStatus("Version restored");
  };
  return { doc, dirty, saving, conflict, status, change, save, replace, draft: () => latest.current };
}
