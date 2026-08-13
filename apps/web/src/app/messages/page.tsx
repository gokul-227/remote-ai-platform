"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Plus, Send, Wifi, WifiOff, MessageSquarePlus, ArrowLeft, Sparkles } from "lucide-react";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MessageBubble } from "@/components/MessageBubble";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

function NewConversationModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (participantId: string) => void }) {
  const [participantId, setParticipantId] = useState("");
  const submit = () => {
    if (participantId.trim()) {
      onCreate(participantId.trim());
      onClose();
      setParticipantId("");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Conversation">
      <p className="text-sm text-slate-500 mb-3">Enter the user ID of the person you want to message.</p>
      <input
        autoFocus
        value={participantId}
        onChange={(e) => setParticipantId(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="User ID (UUID)"
        className="input-enterprise"
      />
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
        <Button fullWidth disabled={!participantId.trim()} onClick={submit}>Start Chat</Button>
      </div>
    </Modal>
  );
}

function ConversationItem({ conv, isSelected, onClick }: { conv: { id: string; updated_at?: string }; isSelected: boolean; onClick: () => void }) {
  const label = `Conversation ${conv.id.slice(0, 8).toUpperCase()}`;
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
        isSelected ? "bg-[var(--color-brand-light)]" : "hover:bg-slate-50"
      )}
    >
      <Avatar name={label} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("text-sm truncate", isSelected ? "font-semibold text-slate-900" : "font-medium text-slate-700")}>{label}</span>
          {conv.updated_at && <span className="text-[11px] text-slate-400 shrink-0">{timeAgo(conv.updated_at)}</span>}
        </div>
        <span className="text-xs text-slate-400 block truncate">Click to open conversation</span>
      </div>
    </button>
  );
}

export default function MessagesPage() {
  return (
    <RequireAuth>
      <MessagesContent />
    </RequireAuth>
  );
}

function MessagesContent() {
  const { user } = useAuth();
  const conversations = useConversations(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const messages = useMessages(selected);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.messages]);

  const convList = (conversations.data ?? []) as Array<{ id: string; updated_at?: string }>;
  const filtered = search ? convList.filter((c) => c.id.toLowerCase().includes(search.toLowerCase())) : convList;

  function handleSend() {
    if (!draft.trim() || !selected) return;
    messages.send(draft.trim());
    setDraft("");
    inputRef.current?.focus();
  }

  function handleSelectConv(id: string) {
    setSelected(id);
    setMobileView("chat");
  }

  return (
    <>
      <div className="card-enterprise flex h-[calc(100vh-140px)] min-h-[500px] overflow-hidden">
        {/* Sidebar */}
        <div className={cn("w-full sm:w-80 sm:min-w-80 border-r border-[var(--border-color)] flex flex-col", mobileView === "chat" && "hidden sm:flex")}>
          <div className="p-4 border-b border-[var(--border-color)] space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold text-slate-900">Messages</h1>
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowNew(true)} />
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations…" className="input-enterprise pl-9 text-sm" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {conversations.isLoading ? (
              <p className="text-center text-sm text-slate-400 pt-8">Loading…</p>
            ) : filtered.length === 0 ? (
              <EmptyState icon={MessageSquarePlus} title="No conversations yet" description="Click + to start a new chat." />
            ) : (
              filtered.map((conv) => (
                <ConversationItem key={conv.id} conv={conv} isSelected={selected === conv.id} onClick={() => handleSelectConv(conv.id)} />
              ))
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className={cn("flex-1 flex flex-col", mobileView === "list" && "hidden sm:flex")}>
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
              <div className="h-16 w-16 rounded-2xl bg-[var(--color-ai-soft)] flex items-center justify-center">
                <Sparkles className="h-7 w-7 text-[var(--color-ai)]" />
              </div>
              <div>
                <p className="text-base font-semibold text-slate-700">Select a conversation</p>
                <p className="text-sm text-slate-400 mt-1">Choose from the left or start a new one.</p>
              </div>
              <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setShowNew(true)}>New Conversation</Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[var(--border-color)]">
                <button className="sm:hidden text-slate-500" onClick={() => setMobileView("list")}>
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <Avatar name={`Conv ${selected.slice(0, 6)}`} size="md" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">Conversation {selected.slice(0, 8).toUpperCase()}</p>
                  <p className="flex items-center gap-1 text-xs">
                    {messages.connected ? (
                      <><Wifi className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600">Live</span></>
                    ) : (
                      <><WifiOff className="h-3 w-3 text-slate-400" /><span className="text-slate-400">Offline</span></>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2.5 bg-[var(--bg-page)]">
                {messages.messages.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-sm text-slate-400">No messages yet. Say hello!</div>
                ) : (
                  messages.messages.map((msg) => (
                    <MessageBubble key={msg.id} content={msg.content} isOwn={msg.sender_id === user?.id} timestamp={msg.created_at} />
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              <div className="p-4 border-t border-[var(--border-color)]">
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Write a message…"
                    className="flex-1 bg-transparent outline-none text-sm text-slate-900 placeholder:text-slate-400"
                  />
                  <Button size="sm" disabled={!draft.trim()} onClick={handleSend} icon={<Send className="h-4 w-4" />} />
                </div>
                <p className="text-[11px] text-slate-400 text-center mt-1.5">Press Enter to send · Shift+Enter for new line</p>
              </div>
            </>
          )}
        </div>
      </div>

      <NewConversationModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreate={(participantId) =>
          conversations.create.mutate(participantId, {
            onSuccess: (data: { id: string }) => {
              setSelected(data.id);
              setMobileView("chat");
            },
          })
        }
      />
    </>
  );
}
