"use client";

import { useState, useRef } from "react";
import {
  Send,
  Trash2,
  Image as ImageIcon,
  Link as LinkIcon,
  Sparkles,
  MessageCircle,
  Repeat2,
  Share2,
  Globe,
  Users,
  Lock,
  Briefcase,
  Trophy,
  FileText,
  MoreHorizontal,
  Bookmark,
  BookmarkCheck,
  ThumbsUp,
  X,
  TrendingUp,
  Building2,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { useFeed, usePostComments, Post, Comment } from "@/hooks/useFeed";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { FeedPostSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

const POST_TYPES = [
  { id: "update", label: "Share an update", icon: Globe, color: "text-[#0A66C2]" },
  { id: "project", label: "Project update", icon: Briefcase, color: "text-emerald-600" },
  { id: "achievement", label: "Celebrate achievement", icon: Trophy, color: "text-amber-500" },
  { id: "article", label: "Write article", icon: FileText, color: "text-purple-600" },
];

const TRENDING_SKILLS = [
  { skill: "Rust", change: "+38%", hot: true },
  { skill: "LLM Integration", change: "+65%", hot: true },
  { skill: "dbt / Data Eng.", change: "+24%" },
  { skill: "Next.js 15", change: "+19%" },
  { skill: "Kubernetes", change: "+11%" },
];

const SUGGESTED_COMPANIES = [
  { name: "Linear", role: "Senior Professionals", count: 4 },
  { name: "Vercel", role: "Full Stack Devs", count: 7 },
  { name: "Stripe", role: "Backend Professionals", count: 3 },
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function CommentSection({ postId, currentUserId }: { postId: string; currentUserId?: string }) {
  const { data: comments, isLoading, addComment, deleteComment } = usePostComments(postId);
  const [commentText, setCommentText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    addComment.mutate(commentText.trim(), {
      onSuccess: () => setCommentText(""),
    });
  };

  return (
    <div className="border-t border-[var(--border-color)] pt-3 mt-1 space-y-3 px-4 pb-3">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <Avatar name={currentUserId || "You"} size="sm" />
        <input
          ref={inputRef}
          type="text"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Add a comment…"
          className="flex-1 bg-[var(--bg-subtle)] border border-[var(--border-color)] rounded-full px-3 py-1.5 text-xs text-[var(--text-main)] placeholder:text-[var(--text-light)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:border-[var(--color-brand)] transition-all"
        />
        {commentText.trim() && (
          <button
            type="submit"
            disabled={addComment.isPending}
            className="h-7 w-7 flex items-center justify-center rounded-full bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] transition-colors disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        )}
      </form>

      {isLoading ? (
        <div className="text-xs text-[var(--text-light)] pl-8">Loading comments…</div>
      ) : comments && comments.length > 0 ? (
        <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
          {comments.map((c: Comment) => (
            <div key={c.id} className="flex items-start gap-2">
              <Avatar name={c.author?.full_name || "Member"} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="bg-[var(--bg-subtle)] rounded-2xl rounded-tl-sm px-3 py-2">
                  <p className="text-xs font-semibold text-[var(--text-main)]">
                    {c.author?.full_name || "Community Member"}
                  </p>
                  <p className="text-xs text-[var(--text-main)] mt-0.5 leading-relaxed">{c.content}</p>
                </div>
                <div className="flex items-center gap-3 mt-1 pl-2">
                  <span className="text-[10px] text-[var(--text-light)]">{timeAgo(c.created_at)}</span>
                  <button className="text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--color-brand)] transition-colors">Like</button>
                  <button className="text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--color-brand)] transition-colors">Reply</button>
                  {currentUserId === c.author_id && (
                    <button
                      onClick={() => deleteComment.mutate(c.id)}
                      className="text-[10px] font-semibold text-[var(--text-light)] hover:text-[var(--color-error)] transition-colors ml-auto"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--text-light)] pl-8 italic">No comments yet. Be the first!</p>
      )}
    </div>
  );
}

function PostCard({
  post,
  currentUserId,
  onLike,
  onDelete,
  onShare,
}: {
  post: Post;
  currentUserId?: string;
  onLike: (id: string) => void;
  onDelete: (id: string) => void;
  onShare: (post: Post) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const VisibilityIcon = post.visibility === "CONNECTIONS" ? Users : post.visibility === "PRIVATE" ? Lock : Globe;

  return (
    <article className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-xs)] overflow-hidden transition-shadow hover:shadow-[var(--shadow-sm)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="flex items-start gap-3">
          <Avatar name={post.author?.full_name || "Member"} src={post.author?.avatar_url} size="md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-main)] leading-tight">
              {post.author?.full_name || "Community Member"}
            </p>
            <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
              <span className="capitalize">{post.author?.role?.toLowerCase() || "Member"}</span>
              <span>·</span>
              <span>{timeAgo(post.created_at)}</span>
              <span>·</span>
              <VisibilityIcon className="h-3 w-3" />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSaved(!saved)}
            className="p-1.5 rounded-lg text-[var(--text-light)] hover:bg-[var(--bg-subtle)] hover:text-[var(--color-brand)] transition-colors"
            title={saved ? "Unsave" : "Save post"}
          >
            {saved ? <BookmarkCheck className="h-4 w-4 text-[var(--color-brand)]" /> : <Bookmark className="h-4 w-4" />}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowMore(!showMore)}
              className="p-1.5 rounded-lg text-[var(--text-light)] hover:bg-[var(--bg-subtle)] transition-colors"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {showMore && (
              <div className="absolute right-0 top-8 w-44 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg shadow-[var(--shadow-md)] z-20 py-1 text-sm">
                {currentUserId === post.author_id && (
                  <button
                    onClick={() => { onDelete(post.id); setShowMore(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[var(--color-error)] hover:bg-[var(--bg-subtle)] text-xs transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete post
                  </button>
                )}
                <button
                  onClick={() => { onShare(post); setShowMore(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[var(--text-main)] hover:bg-[var(--bg-subtle)] text-xs transition-colors"
                >
                  <Share2 className="h-3.5 w-3.5" /> Copy link
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-3 pb-1">
        <p className="text-sm text-[var(--text-main)] leading-relaxed whitespace-pre-wrap">{post.content}</p>

        {post.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.image_url}
            alt=""
            className="mt-3 rounded-lg border border-[var(--border-color)] w-full object-cover max-h-96"
          />
        )}

        {post.link_url && (
          <a
            href={post.link_url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center gap-2 p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-page)] transition-colors"
          >
            <LinkIcon className="h-4 w-4 text-[var(--color-brand)] shrink-0" />
            <span className="text-xs text-[var(--color-brand)] font-medium truncate">
              {post.link_preview_title || post.link_url}
            </span>
          </a>
        )}
      </div>

      {/* Reaction counts */}
      {(post.like_count > 0 || post.comment_count > 0) && (
        <div className="flex items-center justify-between px-4 py-1.5 text-xs text-[var(--text-muted)]">
          {post.like_count > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-4 w-4 rounded-full bg-[var(--color-brand)] flex items-center justify-center">
                <ThumbsUp className="h-2.5 w-2.5 text-white" />
              </span>
              {post.like_count}
            </span>
          )}
          {post.comment_count > 0 && (
            <button
              onClick={() => setShowComments(!showComments)}
              className="hover:underline ml-auto"
            >
              {post.comment_count} {post.comment_count === 1 ? "comment" : "comments"}
            </button>
          )}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center border-t border-[var(--border-color)] mx-4 py-1">
        <button
          onClick={() => onLike(post.id)}
          className={cn(
            "flex items-center gap-1.5 flex-1 justify-center px-2 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-subtle)]",
            post.liked_by_me ? "text-[var(--color-brand)]" : "text-[var(--text-muted)]"
          )}
        >
          <ThumbsUp className={cn("h-4 w-4", post.liked_by_me && "fill-current")} />
          <span className="hidden sm:inline">Like</span>
        </button>
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 flex-1 justify-center px-2 py-2 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          <span className="hidden sm:inline">Comment</span>
        </button>
        <button className="flex items-center gap-1.5 flex-1 justify-center px-2 py-2 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] transition-colors">
          <Repeat2 className="h-4 w-4" />
          <span className="hidden sm:inline">Repost</span>
        </button>
        <button
          onClick={() => onShare(post)}
          className="flex items-center gap-1.5 flex-1 justify-center px-2 py-2 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
        >
          <Share2 className="h-4 w-4" />
          <span className="hidden sm:inline">Share</span>
        </button>
      </div>

      {/* Comments */}
      {showComments && <CommentSection postId={post.id} currentUserId={currentUserId} />}
    </article>
  );
}

function PostComposer({
  user,
  onSubmit,
  isPending,
}: {
  user: { full_name?: string; avatar_url?: string } | null;
  onSubmit: (data: { content: string; visibility: string; image_url?: string; link_url?: string }) => void;
  isPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [showAttach, setShowAttach] = useState(false);
  const [postType, setPostType] = useState("update");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    onSubmit({
      content: content.trim(),
      visibility,
      image_url: imageUrl.trim() || undefined,
      link_url: linkUrl.trim() || undefined,
    });
    setContent("");
    setImageUrl("");
    setLinkUrl("");
    setShowAttach(false);
    setExpanded(false);
  };

  if (!expanded) {
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-xs)] p-4">
        <div className="flex items-center gap-3">
          <Avatar name={user?.full_name || "You"} size="md" />
          <button
            onClick={() => setExpanded(true)}
            className="flex-1 text-left px-4 py-2.5 rounded-full border border-[var(--border-color)] text-sm text-[var(--text-light)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-page)] hover:border-[var(--border-hover)] transition-all"
          >
            Start a post, share an update…
          </button>
        </div>
        <div className="flex items-center gap-1 mt-3 pt-3 border-t border-[var(--border-color)]">
          {POST_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => { setPostType(t.id); setExpanded(true); }}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] transition-colors", t.color)}
            >
              <t.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-md)] p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <Avatar name={user?.full_name || "You"} size="md" />
          <div>
            <p className="text-sm font-semibold text-[var(--text-main)]">{user?.full_name}</p>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className="mt-0.5 text-xs border border-[var(--border-color)] rounded-md px-2 py-0.5 bg-[var(--bg-subtle)] text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
            >
              <option value="PUBLIC">🌐 Anyone</option>
              <option value="CONNECTIONS">👥 Connections only</option>
              <option value="PRIVATE">🔒 Only me</option>
            </select>
          </div>
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="p-1.5 rounded-lg text-[var(--text-light)] hover:bg-[var(--bg-subtle)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Post type selector */}
      <div className="flex items-center gap-1 mb-3 border-b border-[var(--border-color)] pb-3">
        {POST_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => setPostType(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
              postType === t.id
                ? "bg-[var(--color-brand-light)] text-[var(--color-brand)]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          autoFocus
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            postType === "project" ? "What are you building? Share a project update…"
            : postType === "achievement" ? "Celebrate a milestone or achievement…"
            : postType === "article" ? "Share your thoughts, findings, or technical deep dive…"
            : "What's on your mind? Share an update with your network…"
          }
          rows={5}
          className="w-full bg-transparent border-none outline-none text-sm text-[var(--text-main)] placeholder:text-[var(--text-light)] resize-none leading-relaxed"
        />

        {showAttach && (
          <div className="grid gap-2 sm:grid-cols-2 p-3 bg-[var(--bg-subtle)] rounded-lg border border-[var(--border-color)]">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-[var(--color-brand)] shrink-0" />
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Image URL"
                className="flex-1 bg-transparent text-xs text-[var(--text-main)] border-none outline-none placeholder:text-[var(--text-light)]"
              />
            </div>
            <div className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-emerald-600 shrink-0" />
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="Link URL"
                className="flex-1 bg-transparent text-xs text-[var(--text-main)] border-none outline-none placeholder:text-[var(--text-light)]"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-color)]">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowAttach(!showAttach)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                showAttach ? "bg-[var(--color-brand-light)] text-[var(--color-brand)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
              )}
              title="Add media or link"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
              title="Add link"
              onClick={() => setShowAttach(!showAttach)}
            >
              <LinkIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs", content.length > 2800 ? "text-[var(--color-error)]" : "text-[var(--text-light)]")}>
              {content.length}/3000
            </span>
            <Button
              type="submit"
              disabled={!content.trim() || content.length > 3000}
              loading={isPending}
              size="sm"
            >
              Post
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ProfileWidget({ user }: { user: { full_name?: string; email?: string; role?: string } | null }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-xs)] overflow-hidden">
      {/* Banner */}
      <div className="h-14 bg-gradient-to-br from-[#0A66C2] via-[#1d4ed8] to-[#7c3aed]" />
      <div className="px-4 pb-4">
        <div className="-mt-6 mb-2">
          <Avatar name={user?.full_name || "You"} size="lg" className="ring-2 ring-[var(--bg-surface)]" />
        </div>
        <p className="text-sm font-semibold text-[var(--text-main)]">{user?.full_name}</p>
        <p className="text-xs text-[var(--text-muted)] capitalize mt-0.5">{user?.role?.toLowerCase()} · Remote AI Platform</p>
        <div className="mt-3 pt-3 border-t border-[var(--border-color)] space-y-2">
          <Link href="/network" className="flex items-center justify-between text-xs text-[var(--text-muted)] hover:text-[var(--color-brand)] transition-colors group">
            <span>My Network</span>
            <span className="text-[var(--color-brand)] font-semibold group-hover:underline">→</span>
          </Link>
          <Link href="/jobs" className="flex items-center justify-between text-xs text-[var(--text-muted)] hover:text-[var(--color-brand)] transition-colors group">
            <span>Saved Jobs</span>
            <span className="text-[var(--color-brand)] font-semibold group-hover:underline">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function TrendingPanel() {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-xs)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-main)] flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-[var(--color-brand)]" />
          Trending Skills
        </h3>
      </div>
      <div className="space-y-2">
        {TRENDING_SKILLS.map((s) => (
          <div key={s.skill} className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-main)] font-medium">{s.skill}</span>
            <span className={cn(
              "text-[10px] font-semibold px-1.5 py-0.5 rounded-md",
              s.hot ? "text-emerald-700 bg-emerald-50" : "text-[var(--text-muted)] bg-[var(--bg-subtle)]"
            )}>
              {s.change}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HiringWidget() {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-xs)] p-4 space-y-3">
      <div className="flex items-center gap-1.5">
        <Building2 className="h-4 w-4 text-[var(--color-brand)]" />
        <h3 className="text-sm font-semibold text-[var(--text-main)]">Organizations Hiring</h3>
      </div>
      <div className="space-y-2.5">
        {SUGGESTED_COMPANIES.map((c) => (
          <div key={c.name} className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-[var(--text-main)]">{c.name}</p>
              <p className="text-[10px] text-[var(--text-muted)]">{c.role}</p>
            </div>
            <Link
              href="/jobs"
              className="shrink-0 text-[10px] font-semibold text-[var(--color-brand)] border border-[var(--color-brand)] rounded-full px-2 py-0.5 hover:bg-[var(--color-brand-light)] transition-colors"
            >
              {c.count} open
            </Link>
          </div>
        ))}
      </div>
      <Link href="/jobs" className="block text-xs text-center text-[var(--color-brand)] hover:underline pt-1 border-t border-[var(--border-color)]">
        Explore all opportunities →
      </Link>
    </div>
  );
}

export default function SocialFeedPage() {
  return (
    <RequireAuth>
      <SocialFeedContent />
    </RequireAuth>
  );
}

function SocialFeedContent() {
  const { user } = useAuth();
  const toast = useToast();
  const [page] = useState(1);
  const [filterTab, setFilterTab] = useState<"all" | "connections" | "media">("all");
  const { data: feedData, isLoading, createPost, likePost, deletePost } = useFeed(page);

  const handlePostSubmit = (data: { content: string; visibility: string; image_url?: string; link_url?: string }) => {
    createPost.mutate(data, {
      onSuccess: () => toast.show("Post published successfully", "success"),
      onError: () => toast.show("Failed to publish post", "error"),
    });
  };

  const handleShare = (post: Post) => {
    const url = `${window.location.origin}/feed#post-${post.id}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.show("Post link copied to clipboard", "success");
    }).catch(() => {
      toast.show(`Permalink: ${url}`, "info");
    });
  };

  const posts: Post[] = feedData?.posts || [];
  const filteredPosts = posts.filter((p) => {
    if (filterTab === "connections") return p.visibility === "CONNECTIONS";
    if (filterTab === "media") return !!(p.image_url || p.link_url);
    return true;
  });

  const FILTER_TABS = [
    { id: "all", label: "All" },
    { id: "connections", label: "Connections" },
    { id: "media", label: "Media & Links" },
  ] as const;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 py-6 max-w-[1200px] mx-auto">
      {/* Left sidebar */}
      <div className="hidden lg:block lg:col-span-3 space-y-4">
        <ProfileWidget user={user} />
        <Sidebar />
      </div>

      {/* Main feed */}
      <div className="lg:col-span-6 space-y-4">
        <h1 className="sr-only">Social Feed</h1>
        {/* Post composer */}
        {user && (
          <PostComposer user={user} onSubmit={handlePostSubmit} isPending={createPost.isPending} />
        )}

        {/* Filter tabs */}
        <div className="flex items-center gap-0.5 border-b border-[var(--border-color)]">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                filterTab === tab.id
                  ? "border-[var(--color-brand)] text-[var(--color-brand)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Feed */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <FeedPostSkeleton key={i} />)}
          </div>
        ) : filteredPosts.length > 0 ? (
          <div className="space-y-4">
            {filteredPosts.map((post: Post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUserId={user?.id}
                onLike={(id) => likePost.mutate(id)}
                onDelete={(id) => deletePost.mutate(id)}
                onShare={handleShare}
              />
            ))}
          </div>
        ) : (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl">
            <EmptyState
              icon={Sparkles}
              title={filterTab === "all" ? "Your feed is empty" : `No ${filterTab} posts`}
              description="Share your first update above or connect with professionals and organizations to see posts here."
              actionLabel="Discover people"
              actionHref="/network"
            />
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="hidden lg:block lg:col-span-3 space-y-4">
        <TrendingPanel />
        <HiringWidget />
      </div>
    </div>
  );
}
