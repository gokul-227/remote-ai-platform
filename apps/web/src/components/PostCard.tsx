"use client";

import { Heart, MessageCircle, Repeat2, Share2, Trash2, Globe, Users, Lock } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import type { Post } from "@/hooks/useFeed";

const VISIBILITY_ICON: Record<string, React.ElementType> = {
  CONNECTIONS: Users,
  PRIVATE: Lock,
};

export function PostCard({
  post,
  onLike,
  onComment,
  onShare,
  onDelete,
  canDelete,
  children,
}: {
  post: Post;
  onLike?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
  children?: React.ReactNode;
}) {
  const VisibilityIcon = VISIBILITY_ICON[post.visibility] || Globe;

  return (
    <article className="card-enterprise p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Avatar name={post.author?.full_name || "Member"} src={post.author?.avatar_url} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-main)]">{post.author?.full_name || "Member"}</p>
            <p className="text-xs text-[var(--text-light)] flex items-center gap-1">
              {post.author?.role} · {new Date(post.created_at).toLocaleDateString()} ·
              <VisibilityIcon className="h-3 w-3" />
            </p>
          </div>
        </div>
        {canDelete && onDelete && (
          <button
            onClick={onDelete}
            aria-label="Delete post"
            className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-[var(--color-error)]"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className="text-sm text-[var(--text-main)] leading-relaxed mt-3 whitespace-pre-wrap">{post.content}</p>

      {post.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.image_url} alt="" className="mt-3 rounded-lg border border-[var(--border-color)] w-full object-cover max-h-96" />
      )}

      {post.link_url && (
        <a
          href={post.link_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 block rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs text-[var(--color-brand)] hover:bg-[var(--bg-subtle)] truncate"
        >
          {post.link_preview_title || post.link_url}
        </a>
      )}

      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-[var(--border-color)] text-[var(--text-light)]">
        <button
          onClick={onLike}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-[var(--bg-subtle)]",
            post.liked_by_me && "text-[var(--color-error)]"
          )}
        >
          <Heart className={cn("h-4 w-4", post.liked_by_me && "fill-current")} />
          {post.like_count > 0 && post.like_count}
        </button>
        <button onClick={onComment} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-[var(--bg-subtle)]">
          <MessageCircle className="h-4 w-4" />
          {post.comment_count > 0 && post.comment_count}
        </button>
        <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-[var(--bg-subtle)]">
          <Repeat2 className="h-4 w-4" />
        </button>
        <button onClick={onShare} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-[var(--bg-subtle)] ml-auto">
          <Share2 className="h-4 w-4" />
        </button>
      </div>

      {children}
    </article>
  );
}
