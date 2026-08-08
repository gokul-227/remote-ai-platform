"use client";

import { useState, useRef } from "react";
import {
  Users,
  Plus,
  Search,
  Lock,
  Globe,
  CheckCircle,
  Zap,
  Code,
  Cpu,
  Layers,
  Briefcase,
  Heart,
  Coffee,
  Star,
  ChevronRight,
  MessageCircle,
  X,
  Send,
  LogIn,
  LogOut,
  Crown,
  Shield,
  MoreHorizontal,
  Trash2,
  Clock,
} from "lucide-react";
import { useGroups, useMyGroups, useCreateGroup, useJoinGroup, useLeaveGroup, useGroupPosts, useCreateGroupPost, Group } from "@/hooks/useGroups";
import { useAuth } from "@/lib/auth";

// ── Category meta ─────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "all", label: "All Groups", icon: Layers, color: "#a78bfa" },
  { id: "technology", label: "Technology", icon: Cpu, color: "#38bdf8" },
  { id: "frontend", label: "Frontend", icon: Code, color: "#fb923c" },
  { id: "backend", label: "Backend", icon: Zap, color: "#4ade80" },
  { id: "devops", label: "DevOps", icon: Layers, color: "#f472b6" },
  { id: "career", label: "Career", icon: Briefcase, color: "#facc15" },
  { id: "general", label: "General", icon: Coffee, color: "#94a3b8" },
  { id: "design", label: "Design", icon: Heart, color: "#f87171" },
];

const CATEGORY_GRADIENTS: Record<string, string> = {
  technology: "from-sky-600/20 to-cyan-600/10",
  frontend: "from-orange-600/20 to-amber-600/10",
  backend: "from-emerald-600/20 to-green-600/10",
  devops: "from-pink-600/20 to-rose-600/10",
  career: "from-yellow-600/20 to-amber-600/10",
  general: "from-slate-600/20 to-slate-500/10",
  design: "from-red-600/20 to-rose-500/10",
  all: "from-violet-600/20 to-purple-600/10",
};

function CategoryIcon({ category }: { category: string }) {
  const cat = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];
  const Icon = cat.icon;
  return <Icon size={16} style={{ color: cat.color }} />;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function Avatar({ name, size = 40, className = "" }: { name: string; size?: number; className?: string }) {
  const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const colors = ["#6d28d9", "#0891b2", "#059669", "#d97706", "#dc2626", "#7c3aed"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.35,
        fontWeight: 700,
        color: "#fff",
        flexShrink: 0,
        letterSpacing: "0.05em",
      }}
    >
      {initials}
    </div>
  );
}

// ── Group Card ────────────────────────────────────────────────────────────────
function GroupCard({
  group,
  onClick,
  onJoin,
  onLeave,
  joining,
  leaving,
}: {
  group: Group;
  onClick: () => void;
  onJoin: () => void;
  onLeave: () => void;
  joining: boolean;
  leaving: boolean;
}) {
  const gradient = CATEGORY_GRADIENTS[group.category] ?? CATEGORY_GRADIENTS.general;
  const catMeta = CATEGORIES.find((c) => c.id === group.category);
  const Icon = catMeta?.icon ?? Layers;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        overflow: "hidden",
        cursor: "pointer",
        transition: "all 0.2s ease",
        display: "flex",
        flexDirection: "column",
      }}
      className="group-card"
      onClick={onClick}
    >
      {/* Banner gradient */}
      <div
        style={{
          height: 72,
          background: `linear-gradient(135deg, ${catMeta?.color ?? "#6d28d9"}33 0%, transparent 100%)`,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={32} style={{ color: catMeta?.color ?? "#a78bfa", opacity: 0.6 }} />
        {group.is_verified && (
          <div style={{ position: "absolute", top: 10, right: 10 }}>
            <CheckCircle size={16} color="#34d399" />
          </div>
        )}
        {group.is_private && (
          <div style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.4)", borderRadius: 20, padding: "2px 8px" }}>
            <Lock size={10} color="#94a3b8" />
            <span style={{ fontSize: 10, color: "#94a3b8" }}>Private</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", margin: 0, lineHeight: 1.3 }}>{group.name}</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
              <CategoryIcon category={group.category} />
              <span style={{ fontSize: 11, color: "#64748b", textTransform: "capitalize" }}>{group.category}</span>
            </div>
          </div>
          {group.is_member && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(167,139,250,0.15)", borderRadius: 20, padding: "3px 8px", flexShrink: 0 }}>
              <CheckCircle size={10} color="#a78bfa" />
              <span style={{ fontSize: 10, color: "#a78bfa", fontWeight: 600 }}>{group.my_role ?? "member"}</span>
            </div>
          )}
        </div>

        {group.description && (
          <p style={{ fontSize: 12, color: "#64748b", margin: 0, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {group.description}
          </p>
        )}

        {/* Tags */}
        {group.tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {group.tags.slice(0, 3).map((tag) => (
              <span key={tag} style={{ fontSize: 10, color: "#94a3b8", background: "rgba(148,163,184,0.1)", borderRadius: 4, padding: "2px 6px" }}>
                #{tag}
              </span>
            ))}
            {group.tags.length > 3 && <span style={{ fontSize: 10, color: "#475569" }}>+{group.tags.length - 3}</span>}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "auto", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748b" }}>
            <Users size={12} />
            {group.member_count.toLocaleString()} members
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748b" }}>
            <MessageCircle size={12} />
            {group.post_count.toLocaleString()} posts
          </span>
        </div>

        {/* Action */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            group.is_member ? onLeave() : onJoin();
          }}
          disabled={joining || leaving}
          style={{
            width: "100%",
            padding: "8px 0",
            borderRadius: 10,
            border: group.is_member ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(167,139,250,0.4)",
            background: group.is_member ? "transparent" : "rgba(167,139,250,0.15)",
            color: group.is_member ? "#64748b" : "#a78bfa",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            transition: "all 0.2s",
          }}
        >
          {group.is_member ? (
            <><LogOut size={13} />Leave</>
          ) : (
            <><LogIn size={13} />{group.is_private ? "Request to Join" : "Join Group"}</>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Group Detail Panel ────────────────────────────────────────────────────────
function GroupDetailPanel({ group, onClose }: { group: Group; onClose: () => void }) {
  const { data: postsData, isLoading: postsLoading } = useGroupPosts(group.id);
  const createPost = useCreateGroupPost(group.id);
  const [postContent, setPostContent] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  const handlePost = () => {
    if (!postContent.trim()) return;
    createPost.mutate(postContent.trim(), { onSuccess: () => setPostContent("") });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(8px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(520px, 95vw)",
          height: "100vh",
          background: "linear-gradient(180deg, #0f1629 0%, #0a0f1e 100%)",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            background: `linear-gradient(135deg, ${CATEGORIES.find((c) => c.id === group.category)?.color ?? "#6d28d9"}22 0%, transparent 100%)`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(167,139,250,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CategoryIcon category={group.category} />
              </div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9", margin: 0 }}>{group.name}</h2>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  {group.is_verified && <CheckCircle size={12} color="#34d399" />}
                  {group.is_private ? <Lock size={12} color="#64748b" /> : <Globe size={12} color="#64748b" />}
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    {group.is_private ? "Private" : "Public"} · {group.member_count.toLocaleString()} members
                  </span>
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 4 }}>
              <X size={20} />
            </button>
          </div>

          {group.description && (
            <p style={{ fontSize: 13, color: "#94a3b8", margin: 0, lineHeight: 1.6 }}>{group.description}</p>
          )}

          {group.tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10 }}>
              {group.tags.map((tag) => (
                <span key={tag} style={{ fontSize: 11, color: "#a78bfa", background: "rgba(167,139,250,0.12)", borderRadius: 4, padding: "2px 8px" }}>
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Post composer (only if member) */}
        {group.is_member && (
          <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", gap: 10 }}>
              <Avatar name="You" size={36} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <textarea
                  ref={textRef}
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  placeholder="Share something with the group…"
                  rows={2}
                  style={{
                    width: "100%",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    color: "#e2e8f0",
                    fontSize: 13,
                    padding: "10px 12px",
                    resize: "none",
                    outline: "none",
                    fontFamily: "inherit",
                    lineHeight: 1.5,
                  }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={handlePost}
                    disabled={!postContent.trim() || createPost.isPending}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 16px",
                      borderRadius: 8,
                      border: "none",
                      background: postContent.trim() ? "linear-gradient(135deg, #7c3aed, #4f46e5)" : "rgba(255,255,255,0.05)",
                      color: postContent.trim() ? "#fff" : "#475569",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: postContent.trim() ? "pointer" : "not-allowed",
                      transition: "all 0.2s",
                    }}
                  >
                    <Send size={13} />
                    {createPost.isPending ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Posts feed */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          {postsLoading && (
            <div style={{ textAlign: "center", color: "#475569", fontSize: 13, paddingTop: 32 }}>Loading posts…</div>
          )}
          {!postsLoading && !group.is_member && !group.is_private && (
            <div style={{
              textAlign: "center",
              padding: "32px 16px",
              color: "#475569",
              background: "rgba(255,255,255,0.02)",
              borderRadius: 12,
              border: "1px dashed rgba(255,255,255,0.08)",
            }}>
              <Users size={32} color="#334155" style={{ marginBottom: 12 }} />
              <p style={{ margin: 0, fontSize: 14 }}>Join this group to post and interact</p>
            </div>
          )}
          {postsData?.posts.map((post) => (
            <div
              key={post.id}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 12,
                padding: "14px 16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar name={post.author_id.slice(0, 6)} size={32} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>Member</div>
                    <div style={{ fontSize: 11, color: "#475569", display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock size={10} />
                      {timeAgo(post.created_at)}
                    </div>
                  </div>
                </div>
                {post.is_pinned && (
                  <span style={{ fontSize: 10, color: "#facc15", background: "rgba(250,204,21,0.1)", borderRadius: 4, padding: "2px 6px" }}>
                    📌 Pinned
                  </span>
                )}
              </div>
              <p style={{ fontSize: 13, color: "#cbd5e1", margin: 0, lineHeight: 1.6 }}>{post.content}</p>
              <div style={{ display: "flex", gap: 12, marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <button style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "#475569", fontSize: 12, cursor: "pointer", padding: 0 }}>
                  <Heart size={13} />{post.like_count}
                </button>
                <button style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "#475569", fontSize: 12, cursor: "pointer", padding: 0 }}>
                  <MessageCircle size={13} />{post.comment_count}
                </button>
              </div>
            </div>
          ))}
          {postsData?.posts.length === 0 && group.is_member && (
            <div style={{ textAlign: "center", color: "#475569", fontSize: 13, paddingTop: 24 }}>
              No posts yet. Be the first to share something!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Create Group Modal ────────────────────────────────────────────────────────
function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const createGroup = useCreateGroup();
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "general",
    tags: "",
    is_private: false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createGroup.mutate(
      {
        name: form.name,
        description: form.description || undefined,
        category: form.category,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        is_private: form.is_private,
      },
      { onSuccess: onClose }
    );
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    color: "#e2e8f0",
    fontSize: 14,
    padding: "10px 14px",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{
          background: "linear-gradient(180deg, #0f1629 0%, #0a0f1e 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20,
          width: "min(480px, 100%)",
          padding: 32,
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", margin: 0 }}>Create a Community</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Community Name *
            </label>
            <input
              style={inputStyle}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Remote Python Developers"
              required
              minLength={2}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Description
            </label>
            <textarea
              style={{ ...inputStyle, resize: "none" }}
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What is this community about?"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Category
              </label>
              <select
                style={{ ...inputStyle, cursor: "pointer" }}
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.filter((c) => c.id !== "all").map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Visibility
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {[{ v: false, label: "Public", icon: Globe }, { v: true, label: "Private", icon: Lock }].map(({ v, label, icon: Icon }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, is_private: v }))}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: 10,
                      border: form.is_private === v ? "1px solid rgba(167,139,250,0.5)" : "1px solid rgba(255,255,255,0.08)",
                      background: form.is_private === v ? "rgba(167,139,250,0.15)" : "transparent",
                      color: form.is_private === v ? "#a78bfa" : "#64748b",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                    }}
                  >
                    <Icon size={12} />{label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Tags (comma-separated)
            </label>
            <input
              style={inputStyle}
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="python, backend, async"
            />
          </div>

          <button
            type="submit"
            disabled={!form.name.trim() || createGroup.isPending}
            style={{
              width: "100%",
              padding: "12px 0",
              borderRadius: 12,
              border: "none",
              background: form.name.trim() ? "linear-gradient(135deg, #7c3aed, #4f46e5)" : "rgba(255,255,255,0.05)",
              color: form.name.trim() ? "#fff" : "#475569",
              fontSize: 15,
              fontWeight: 700,
              cursor: form.name.trim() ? "pointer" : "not-allowed",
              marginTop: 8,
              transition: "all 0.2s",
              boxShadow: form.name.trim() ? "0 8px 24px rgba(124,58,237,0.3)" : "none",
            }}
          >
            {createGroup.isPending ? "Creating…" : "Create Community"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function GroupsPage() {
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<"discover" | "joined">("discover");

  const { data: groupsData, isLoading } = useGroups({
    category: selectedCategory === "all" ? undefined : selectedCategory,
    search: search || undefined,
  });
  const { data: myGroupsData } = useMyGroups();
  const joinGroup = useJoinGroup();
  const leaveGroup = useLeaveGroup();

  const displayGroups = tab === "joined" ? (myGroupsData?.groups ?? []) : (groupsData?.groups ?? []);

  return (
    <>
      <style>{`
        .group-card:hover {
          border-color: rgba(167,139,250,0.25) !important;
          background: rgba(255,255,255,0.05) !important;
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        textarea:focus, input:focus, select:focus {
          border-color: rgba(167,139,250,0.4) !important;
        }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#080e1c", fontFamily: "'Inter', system-ui, sans-serif", color: "#e2e8f0" }}>
        {/* Page Header */}
        <div style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.02)",
          padding: "24px 32px 0",
        }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h1 style={{ fontSize: 28, fontWeight: 900, color: "#f1f5f9", margin: 0, letterSpacing: "-0.02em" }}>
                  Communities
                </h1>
                <p style={{ fontSize: 14, color: "#475569", margin: "6px 0 0" }}>
                  Connect with engineers, share knowledge, and grow together
                </p>
              </div>
              <button
                id="create-group-btn"
                onClick={() => setShowCreate(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 20px",
                  borderRadius: 12,
                  border: "none",
                  background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 4px 20px rgba(124,58,237,0.35)",
                  transition: "all 0.2s",
                  flexShrink: 0,
                }}
              >
                <Plus size={16} />
                Create Community
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 0, marginBottom: 0 }}>
              {([
                { id: "discover", label: "Discover", count: groupsData?.total },
                { id: "joined", label: "My Communities", count: myGroupsData?.total ?? 0 },
              ] as const).map(({ id, label, count }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  style={{
                    padding: "12px 20px",
                    background: "none",
                    border: "none",
                    borderBottom: tab === id ? "2px solid #a78bfa" : "2px solid transparent",
                    color: tab === id ? "#a78bfa" : "#475569",
                    fontSize: 14,
                    fontWeight: tab === id ? 700 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    transition: "all 0.15s",
                  }}
                >
                  {label}
                  {count !== undefined && (
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      background: tab === id ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.05)",
                      color: tab === id ? "#a78bfa" : "#64748b",
                      borderRadius: 20,
                      padding: "1px 7px",
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filters & Content */}
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 32px" }}>
          {tab === "discover" && (
            <>
              {/* Search */}
              <div style={{ position: "relative", marginBottom: 20, maxWidth: 400 }}>
                <Search size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#475569" }} />
                <input
                  id="group-search-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search communities…"
                  style={{
                    width: "100%",
                    paddingLeft: 42,
                    paddingRight: 14,
                    paddingTop: 10,
                    paddingBottom: 10,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    color: "#e2e8f0",
                    fontSize: 14,
                    outline: "none",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Category pills */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const active = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      id={`category-${cat.id}`}
                      onClick={() => setSelectedCategory(cat.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "7px 14px",
                        borderRadius: 20,
                        border: active ? `1px solid ${cat.color}66` : "1px solid rgba(255,255,255,0.08)",
                        background: active ? `${cat.color}22` : "rgba(255,255,255,0.03)",
                        color: active ? cat.color : "#64748b",
                        fontSize: 13,
                        fontWeight: active ? 700 : 500,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      <Icon size={13} />
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Groups grid */}
          {isLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ height: 260, borderRadius: 16, background: "rgba(255,255,255,0.03)", animation: "pulse 2s infinite" }} />
              ))}
            </div>
          ) : displayGroups.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: "80px 24px",
              color: "#475569",
            }}>
              <Users size={48} color="#1e293b" style={{ marginBottom: 16 }} />
              <h3 style={{ fontSize: 18, color: "#334155", margin: "0 0 8px" }}>
                {tab === "joined" ? "You haven't joined any communities yet" : "No communities found"}
              </h3>
              <p style={{ fontSize: 14, margin: "0 0 20px" }}>
                {tab === "joined" ? "Discover and join communities that match your interests" : "Try a different search or category"}
              </p>
              {tab === "joined" && (
                <button
                  onClick={() => setTab("discover")}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 10,
                    border: "1px solid rgba(167,139,250,0.3)",
                    background: "rgba(167,139,250,0.1)",
                    color: "#a78bfa",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Browse Communities
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {displayGroups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  onClick={() => setSelectedGroup(group)}
                  onJoin={() => joinGroup.mutate(group.id)}
                  onLeave={() => leaveGroup.mutate(group.id)}
                  joining={joinGroup.isPending}
                  leaving={leaveGroup.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedGroup && (
        <GroupDetailPanel group={selectedGroup} onClose={() => setSelectedGroup(null)} />
      )}

      {/* Create Modal */}
      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} />}
    </>
  );
}
