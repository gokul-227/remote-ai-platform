"use client";

import { useState, useRef, useEffect } from "react";
import {
  Search,
  Send,
  Plus,
  Circle,
  CheckCheck,
  Wifi,
  WifiOff,
  MessageSquarePlus,
  ArrowLeft,
  MoreVertical,
  Sparkles,
  Clock,
} from "lucide-react";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { useAuth } from "@/lib/auth";

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Avatar({
  name,
  size = 40,
  online = false,
}: {
  name: string;
  size?: number;
  online?: boolean;
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const colors = ["#6d28d9", "#0891b2", "#059669", "#d97706", "#7c3aed", "#0e7490"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.34,
          fontWeight: 700,
          color: "#fff",
          letterSpacing: "0.03em",
        }}
      >
        {initials}
      </div>
      {online && (
        <div
          style={{
            position: "absolute",
            bottom: 1,
            right: 1,
            width: size * 0.28,
            height: size * 0.28,
            borderRadius: "50%",
            background: "#34d399",
            border: "2px solid #080e1c",
          }}
        />
      )}
    </div>
  );
}

// ── New Conversation Modal ────────────────────────────────────────────────────
function NewConversationModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (participantId: string) => void;
}) {
  const [participantId, setParticipantId] = useState("");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "linear-gradient(180deg, #0f1629 0%, #0a0f1e 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 18,
          width: "min(420px, 100%)",
          padding: 28,
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "#f1f5f9",
            margin: "0 0 6px",
          }}
        >
          New Conversation
        </h2>
        <p style={{ fontSize: 13, color: "#475569", margin: "0 0 20px" }}>
          Enter the user ID of the person you want to message
        </p>
        <input
          autoFocus
          value={participantId}
          onChange={(e) => setParticipantId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && participantId.trim()) {
              onCreate(participantId.trim());
              onClose();
            }
          }}
          placeholder="User ID (UUID)"
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            color: "#e2e8f0",
            fontSize: 14,
            padding: "11px 14px",
            outline: "none",
            fontFamily: "inherit",
            boxSizing: "border-box",
            marginBottom: 14,
          }}
        />
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "transparent",
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (participantId.trim()) {
                onCreate(participantId.trim());
                onClose();
              }
            }}
            disabled={!participantId.trim()}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 10,
              border: "none",
              background: participantId.trim()
                ? "linear-gradient(135deg, #7c3aed, #4f46e5)"
                : "rgba(255,255,255,0.05)",
              color: participantId.trim() ? "#fff" : "#475569",
              fontSize: 14,
              fontWeight: 700,
              cursor: participantId.trim() ? "pointer" : "not-allowed",
              boxShadow: participantId.trim()
                ? "0 4px 20px rgba(124,58,237,0.3)"
                : "none",
            }}
          >
            Start Chat
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Conversation Item ─────────────────────────────────────────────────────────
function ConversationItem({
  conv,
  isSelected,
  onClick,
}: {
  conv: { id: string; updated_at?: string; participant_ids?: string[] };
  isSelected: boolean;
  onClick: () => void;
}) {
  const label = `Conversation ${conv.id.slice(0, 8).toUpperCase()}`;
  const updated = conv.updated_at ? timeAgo(conv.updated_at) : "";

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        background: isSelected ? "rgba(167,139,250,0.12)" : "transparent",
        border: "none",
        borderRadius: 12,
        cursor: "pointer",
        transition: "all 0.15s",
        textAlign: "left",
        borderLeft: isSelected ? "3px solid #a78bfa" : "3px solid transparent",
      }}
    >
      <Avatar name={label} size={42} online={false} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 2,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: isSelected ? 700 : 600,
              color: isSelected ? "#f1f5f9" : "#cbd5e1",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {label}
          </span>
          {updated && (
            <span style={{ fontSize: 11, color: "#475569", flexShrink: 0 }}>
              {updated}
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: 12,
            color: "#475569",
            display: "block",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          Click to open conversation
        </span>
      </div>
    </button>
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────────
function MessageBubble({
  msg,
  isMine,
}: {
  msg: { id: string; sender_id: string; content: string; created_at: string };
  isMine: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: isMine ? "row-reverse" : "row",
        alignItems: "flex-end",
        gap: 8,
        marginBottom: 4,
      }}
    >
      {!isMine && (
        <Avatar name={msg.sender_id.slice(0, 6)} size={28} />
      )}
      <div
        style={{
          maxWidth: "68%",
          display: "flex",
          flexDirection: "column",
          alignItems: isMine ? "flex-end" : "flex-start",
          gap: 2,
        }}
      >
        <div
          style={{
            padding: "10px 14px",
            borderRadius: isMine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
            background: isMine
              ? "linear-gradient(135deg, #7c3aed, #4f46e5)"
              : "rgba(255,255,255,0.06)",
            border: isMine ? "none" : "1px solid rgba(255,255,255,0.08)",
            color: "#f1f5f9",
            fontSize: 14,
            lineHeight: 1.5,
            boxShadow: isMine ? "0 4px 16px rgba(124,58,237,0.25)" : "none",
          }}
        >
          {msg.content}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: "#334155",
          }}
        >
          <Clock size={9} />
          {formatTime(msg.created_at)}
          {isMine && <CheckCheck size={12} color="#a78bfa" />}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MessagesPage() {
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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.messages]);

  const convList = (conversations.data ?? []) as Array<{
    id: string;
    updated_at?: string;
    participant_ids?: string[];
  }>;

  const filtered = search
    ? convList.filter((c) => c.id.toLowerCase().includes(search.toLowerCase()))
    : convList;

  const selectedConv = convList.find((c) => c.id === selected);

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
      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        textarea:focus, input:focus { border-color: rgba(167,139,250,0.4) !important; }
        .conv-item:hover { background: rgba(255,255,255,0.04) !important; }
        @media (max-width: 768px) {
          .messages-sidebar { display: ${mobileView === "list" ? "flex" : "none"} !important; }
          .messages-chat { display: ${mobileView === "chat" ? "flex" : "none"} !important; }
        }
      `}</style>

      <div
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          background: "#080e1c",
          fontFamily: "'Inter', system-ui, sans-serif",
          color: "#e2e8f0",
          overflow: "hidden",
        }}
      >
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* ── Sidebar ───────────────────────────────────────────────── */}
          <div
            className="messages-sidebar"
            style={{
              width: 320,
              minWidth: 320,
              borderRight: "1px solid rgba(255,255,255,0.07)",
              display: "flex",
              flexDirection: "column",
              background: "rgba(255,255,255,0.01)",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "20px 20px 12px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                }}
              >
                <h1
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: "#f1f5f9",
                    margin: 0,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Messages
                </h1>
                <button
                  id="new-conversation-btn"
                  onClick={() => setShowNew(true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: "none",
                    background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                    color: "#fff",
                    cursor: "pointer",
                    boxShadow: "0 4px 16px rgba(124,58,237,0.3)",
                    transition: "all 0.2s",
                  }}
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Search */}
              <div style={{ position: "relative" }}>
                <Search
                  size={14}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#475569",
                  }}
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search conversations…"
                  style={{
                    width: "100%",
                    paddingLeft: 36,
                    paddingRight: 12,
                    paddingTop: 9,
                    paddingBottom: 9,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    color: "#e2e8f0",
                    fontSize: 13,
                    outline: "none",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {/* Conversation list */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "8px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {conversations.isLoading && (
                <div
                  style={{
                    textAlign: "center",
                    color: "#334155",
                    fontSize: 13,
                    paddingTop: 32,
                  }}
                >
                  Loading…
                </div>
              )}
              {!conversations.isLoading && filtered.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "48px 16px",
                    color: "#334155",
                  }}
                >
                  <MessageSquarePlus
                    size={40}
                    color="#1e293b"
                    style={{ marginBottom: 12 }}
                  />
                  <p style={{ margin: 0, fontSize: 14, color: "#475569" }}>
                    No conversations yet
                  </p>
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "#334155" }}>
                    Click + to start a new chat
                  </p>
                </div>
              )}
              {filtered.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isSelected={selected === conv.id}
                  onClick={() => handleSelectConv(conv.id)}
                />
              ))}
            </div>
          </div>

          {/* ── Chat Area ─────────────────────────────────────────────── */}
          <div
            className="messages-chat"
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {!selected ? (
              /* Empty state */
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#334155",
                  gap: 16,
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    background:
                      "linear-gradient(135deg, rgba(124,58,237,0.15), rgba(79,70,229,0.1))",
                    border: "1px solid rgba(167,139,250,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Sparkles size={32} color="#7c3aed" />
                </div>
                <div style={{ textAlign: "center" }}>
                  <p
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: "#475569",
                      margin: 0,
                    }}
                  >
                    Select a conversation
                  </p>
                  <p style={{ fontSize: 13, color: "#334155", margin: "6px 0 0" }}>
                    Choose from the left or start a new one
                  </p>
                </div>
                <button
                  onClick={() => setShowNew(true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 20px",
                    borderRadius: 12,
                    border: "1px solid rgba(167,139,250,0.3)",
                    background: "rgba(167,139,250,0.1)",
                    color: "#a78bfa",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  <Plus size={15} />
                  New Conversation
                </button>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div
                  style={{
                    padding: "14px 24px",
                    borderBottom: "1px solid rgba(255,255,255,0.07)",
                    background: "rgba(255,255,255,0.02)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexShrink: 0,
                  }}
                >
                  <button
                    className="mobile-back"
                    onClick={() => setMobileView("list")}
                    style={{
                      display: "none",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#94a3b8",
                      padding: 0,
                    }}
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <Avatar
                    name={`Conv ${selected.slice(0, 6)}`}
                    size={38}
                    online={messages.connected}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: "#f1f5f9",
                      }}
                    >
                      Conversation{" "}
                      {selected.slice(0, 8).toUpperCase()}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                      }}
                    >
                      {messages.connected ? (
                        <>
                          <Wifi size={11} color="#34d399" />
                          <span style={{ color: "#34d399" }}>Live</span>
                        </>
                      ) : (
                        <>
                          <WifiOff size={11} color="#475569" />
                          <span style={{ color: "#475569" }}>Offline</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#475569",
                      padding: 4,
                    }}
                  >
                    <MoreVertical size={18} />
                  </button>
                </div>

                {/* Messages */}
                <div
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "20px 24px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  {messages.messages.length === 0 && (
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "column",
                        gap: 8,
                        color: "#334155",
                      }}
                    >
                      <Circle size={32} color="#1e293b" />
                      <p style={{ margin: 0, fontSize: 13 }}>
                        No messages yet. Say hello! 👋
                      </p>
                    </div>
                  )}
                  {messages.messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      isMine={msg.sender_id === user?.id}
                    />
                  ))}
                  <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div
                  style={{
                    padding: "16px 24px",
                    borderTop: "1px solid rgba(255,255,255,0.07)",
                    background: "rgba(255,255,255,0.02)",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 14,
                      padding: "8px 8px 8px 16px",
                    }}
                  >
                    <input
                      ref={inputRef}
                      id="message-input"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Write a message…"
                      style={{
                        flex: 1,
                        background: "none",
                        border: "none",
                        outline: "none",
                        color: "#e2e8f0",
                        fontSize: 14,
                        fontFamily: "inherit",
                      }}
                    />
                    <button
                      id="send-message-btn"
                      onClick={handleSend}
                      disabled={!draft.trim()}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        border: "none",
                        background: draft.trim()
                          ? "linear-gradient(135deg, #7c3aed, #4f46e5)"
                          : "rgba(255,255,255,0.06)",
                        color: draft.trim() ? "#fff" : "#334155",
                        cursor: draft.trim() ? "pointer" : "not-allowed",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s",
                        flexShrink: 0,
                        boxShadow: draft.trim()
                          ? "0 4px 16px rgba(124,58,237,0.3)"
                          : "none",
                      }}
                    >
                      <Send size={15} />
                    </button>
                  </div>
                  <p
                    style={{
                      fontSize: 11,
                      color: "#334155",
                      margin: "6px 0 0",
                      textAlign: "center",
                    }}
                  >
                    Press Enter to send · Shift+Enter for new line
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showNew && (
        <NewConversationModal
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
      )}
    </>
  );
}
