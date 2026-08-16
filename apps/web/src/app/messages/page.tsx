"use client";

import { useState, useRef, useEffect } from "react";
import {
  Search, Plus, Send, Wifi, WifiOff, MessageSquarePlus, ArrowLeft,
  Sparkles, Paperclip, Smile, Phone, Video, Info,
} from "lucide-react";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

function formatMsgTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function NewConversationModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (participantId: string) => void;
}) {
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
      <p className="text-sm text-[var(--text-muted)] mb-4">
        Enter the user ID of the person you want to message.
      </p>
      <input
        autoFocus
        value={participantId}
        onChange={(e) => setParticipantId(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="User ID (UUID)…"
        className="input-enterprise w-full"
      />
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
        <Button fullWidth disabled={!participantId.trim()} onClick={submit} icon={<Send className="h-4 w-4" />}>
          Start Chat
        </Button>
      </div>
    </Modal>
  );
}

function ConversationItem({
  conv,
  isSelected,
  onClick,
}: {
  conv: { id: string; updated_at?: string };
  isSelected: boolean;
  onClick: () => void;
}) {
  const label = `Conversation ${conv.id.slice(0, 8).toUpperCase()}`;
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all",
        isSelected
          ? "bg-[var(--color-brand-light)]"
          : "hover:bg-[var(--bg-subtle)]"
      )}
    >
      <div className="relative shrink-0">
        <Avatar name={label} size="md" />
        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[var(--bg-surface)]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            "text-sm truncate",
            isSelected ? "font-semibold text-[var(--color-brand)]" : "font-medium text-[var(--text-main)]"
          )}>
            {label}
          </span>
          {conv.updated_at && (
            <span className="text-[11px] text-[var(--text-light)] shrink-0">{timeAgo(conv.updated_at)}</span>
          )}
        </div>
        <span className="text-xs text-[var(--text-muted)] block truncate mt-0.5">Click to open conversation</span>
      </div>
    </button>
  );
}

function MessageBubbleItem({
  content,
  isOwn,
  timestamp,
}: {
  content: string;
  isOwn: boolean;
  timestamp: string;
}) {
  return (
    <div className={cn("flex items-end gap-2 max-w-[78%]", isOwn && "ml-auto flex-row-reverse")}>
      {!isOwn && <Avatar name="Other" size="sm" className="shrink-0 mb-1" />}
      <div className={cn(
        "px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed shadow-[var(--shadow-xs)]",
        isOwn
          ? "bg-[var(--color-brand)] text-white rounded-br-sm"
          : "bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-main)] rounded-bl-sm"
      )}>
        <p>{content}</p>
        <p className={cn("text-[10px] mt-1 text-right", isOwn ? "text-white/70" : "text-[var(--text-light)]")}>
          {formatMsgTime(timestamp)}
        </p>
      </div>
    </div>
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

  const selectedConvLabel = selected ? `Conversation ${selected.slice(0, 8).toUpperCase()}` : "";

  return (
    <>
      <div
        className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-sm)] flex overflow-hidden"
        style={{ height: "calc(100vh - 120px)", minHeight: 520 }}
      >
        {/* Conversation list */}
        <div className={cn(
          "w-80 shrink-0 border-r border-[var(--border-color)] flex flex-col",
          mobileView === "chat" ? "hidden sm:flex" : "flex"
        )}>
          {/* Header */}
          <div className="px-4 py-4 border-b border-[var(--border-color)]">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-base font-bold text-[var(--text-main)]">Messages</h1>
              <button
                onClick={() => setShowNew(true)}
                className="h-8 w-8 flex items-center justify-center rounded-lg bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-light)] pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search messages…"
                className="w-full bg-[var(--bg-subtle)] border border-[var(--border-color)] rounded-lg pl-9 pr-3 py-2 text-sm text-[var(--text-main)] placeholder:text-[var(--text-light)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:border-[var(--color-brand)] transition-all"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-2">
            {conversations.isLoading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse p-2">
                    <div className="h-10 w-10 rounded-full bg-[var(--bg-subtle)]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-[var(--bg-subtle)] rounded w-3/4" />
                      <div className="h-2.5 bg-[var(--bg-subtle)] rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState icon={MessageSquarePlus} title="No conversations" description="Start a new chat to get going." />
            ) : (
              filtered.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isSelected={selected === conv.id}
                  onClick={() => handleSelectConv(conv.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Chat pane */}
        <div className={cn("flex-1 flex flex-col min-w-0", mobileView === "list" ? "hidden sm:flex" : "flex")}>
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center px-6">
              <div className="h-16 w-16 rounded-2xl bg-[var(--color-brand-light)] flex items-center justify-center">
                <Sparkles className="h-7 w-7 text-[var(--color-brand)]" />
              </div>
              <div>
                <p className="text-base font-semibold text-[var(--text-main)]">Select a conversation</p>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  Choose from the list or start a new conversation.
                </p>
              </div>
              <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setShowNew(true)}>
                New Conversation
              </Button>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[var(--border-color)] bg-[var(--bg-surface)]">
                <button className="sm:hidden mr-1 text-[var(--text-muted)] hover:text-[var(--text-main)]" onClick={() => setMobileView("list")}>
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="relative">
                  <Avatar name={selectedConvLabel} size="md" />
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[var(--bg-surface)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-main)]">{selectedConvLabel}</p>
                  <p className="text-xs flex items-center gap-1.5">
                    {messages.connected ? (
                      <><Wifi className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600 font-medium">Online</span></>
                    ) : (
                      <><WifiOff className="h-3 w-3 text-[var(--text-light)]" /><span className="text-[var(--text-muted)]">Offline</span></>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] transition-colors" title="Voice call">
                    <Phone className="h-4 w-4" />
                  </button>
                  <button className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] transition-colors" title="Video call">
                    <Video className="h-4 w-4" />
                  </button>
                  <button className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] transition-colors" title="Info">
                    <Info className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-3 bg-[var(--bg-page)]">
                {messages.messages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                    <div className="h-12 w-12 rounded-xl bg-[var(--bg-subtle)] flex items-center justify-center">
                      <MessageSquarePlus className="h-5 w-5 text-[var(--text-light)]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--text-main)]">No messages yet</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">Say hello to start the conversation!</p>
                    </div>
                  </div>
                ) : (
                  messages.messages.map((msg) => (
                    <MessageBubbleItem
                      key={msg.id}
                      content={msg.content}
                      isOwn={msg.sender_id === user?.id}
                      timestamp={msg.created_at}
                    />
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              {/* Composer */}
              <div className="px-4 py-3.5 border-t border-[var(--border-color)] bg-[var(--bg-surface)]">
                <div className="flex items-center gap-2 bg-[var(--bg-subtle)] border border-[var(--border-color)] rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-[var(--color-brand)]/20 focus-within:border-[var(--color-brand)] transition-all">
                  <button className="text-[var(--text-light)] hover:text-[var(--text-muted)] transition-colors" title="Attach file">
                    <Paperclip className="h-4 w-4" />
                  </button>
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
                    className="flex-1 bg-transparent outline-none text-sm text-[var(--text-main)] placeholder:text-[var(--text-light)]"
                  />
                  <button className="text-[var(--text-light)] hover:text-[var(--text-muted)] transition-colors" title="Emoji">
                    <Smile className="h-4 w-4" />
                  </button>
                  <button
                    disabled={!draft.trim()}
                    onClick={handleSend}
                    className="h-8 w-8 flex items-center justify-center rounded-lg bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-[11px] text-[var(--text-light)] text-center mt-1.5">
                  Enter to send · Shift+Enter for new line
                </p>
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
