"use client";

import { useState } from "react";
import { Send, Trash2, Image as ImageIcon, Link as LinkIcon, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { useFeed, usePostComments, Post, Comment } from "@/hooks/useFeed";
import { PostCard } from "@/components/PostCard";
import { Sidebar } from "@/components/Sidebar";
import { RightSidebar } from "@/components/RightSidebar";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { FeedPostSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

function CommentSection({ postId, currentUserId }: { postId: string; currentUserId?: string }) {
  const { data: comments, isLoading, addComment, deleteComment } = usePostComments(postId);
  const [commentText, setCommentText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    addComment.mutate(commentText.trim(), {
      onSuccess: () => setCommentText(""),
    });
  };

  return (
    <div className="mt-4 pt-4 border-t border-[var(--border-color)] space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Write a comment..."
          className="input-enterprise flex-1 py-1.5 text-xs"
        />
        <Button type="submit" size="sm" disabled={!commentText.trim()} loading={addComment.isPending} icon={<Send className="h-3.5 w-3.5" />} />
      </form>

      {isLoading ? (
        <p className="text-xs text-slate-400">Loading comments...</p>
      ) : comments && comments.length > 0 ? (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {comments.map((c: Comment) => (
            <div key={c.id} className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-2.5 text-xs flex justify-between gap-2 border border-slate-100 dark:border-slate-800">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {c.author?.full_name || "Community Member"}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(c.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{c.content}</p>
              </div>
              {currentUserId === c.author_id && (
                <button
                  onClick={() => deleteComment.mutate(c.id)}
                  className="text-slate-400 hover:text-red-600 p-1 transition-colors"
                  title="Delete comment"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">No comments yet. Be the first to reply!</p>
      )}
    </div>
  );
}

function FeedPostItem({
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

  return (
    <PostCard
      post={post}
      onLike={() => onLike(post.id)}
      onComment={() => setShowComments((v) => !v)}
      onShare={() => onShare(post)}
      canDelete={currentUserId === post.author_id}
      onDelete={() => onDelete(post.id)}
    >
      {showComments && <CommentSection postId={post.id} currentUserId={currentUserId} />}
    </PostCard>
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

  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [showMediaInputs, setShowMediaInputs] = useState(false);

  const handlePostSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    createPost.mutate(
      {
        content: content.trim(),
        visibility,
        image_url: imageUrl.trim() || undefined,
        link_url: linkUrl.trim() || undefined,
      },
      {
        onSuccess: () => {
          setContent("");
          setImageUrl("");
          setLinkUrl("");
          setShowMediaInputs(false);
          toast.show("Post published successfully", "success");
        },
      }
    );
  };

  const handleShare = (post: Post) => {
    const url = `${window.location.origin}/feed#post-${post.id}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.show("Post link copied to clipboard", "success");
    }).catch(() => {
      toast.show(`Post permalink: ${url}`, "info");
    });
  };

  // Filter posts
  const posts: Post[] = feedData?.posts || [];
  const filteredPosts = posts.filter((p) => {
    if (filterTab === "connections") return p.visibility === "CONNECTIONS";
    if (filterTab === "media") return !!(p.image_url || p.link_url);
    return true;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 py-6">
      {/* Left Navigation Sidebar */}
      <div className="lg:col-span-3 space-y-4">
        <Sidebar />
      </div>

      {/* Main Feed Feed Center */}
      <div className="lg:col-span-6 space-y-5">
        {/* Header Banner */}
        <div className="card-enterprise p-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Social Feed <Sparkles className="h-5 w-5 text-[#0A66C2]" />
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Connect with remote software engineering professionals, share work updates, and discuss projects.
            </p>
          </div>
        </div>

        {/* Composer Card */}
        {user && (
          <div className="card-enterprise p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={user.full_name || "You"} size="md" />
              <div>
                <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs">{user.full_name}</span>
                <div className="mt-0.5">
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                    className="text-[11px] border border-slate-200 dark:border-slate-800 rounded px-2 py-0.5 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                  >
                    <option value="PUBLIC">🌐 Public</option>
                    <option value="CONNECTIONS">👥 Connections Only</option>
                    <option value="PRIVATE">🔒 Private</option>
                  </select>
                </div>
              </div>
            </div>

            <form onSubmit={handlePostSubmit} className="space-y-3">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What are you building or working on?"
                rows={3}
                className="text-sm"
              />

              {showMediaInputs && (
                <div className="grid gap-2 sm:grid-cols-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800 animate-fade-in">
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="Image URL (optional)"
                    className="input-enterprise text-xs py-1.5"
                  />
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="Link URL (optional)"
                    className="input-enterprise text-xs py-1.5"
                  />
                </div>
              )}

              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowMediaInputs(!showMediaInputs)}
                  className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-[#0A66C2] transition-colors"
                >
                  <ImageIcon className="h-4 w-4 text-[#0A66C2]" />
                  <LinkIcon className="h-4 w-4 text-emerald-600" />
                  <span>Attach Media / Link</span>
                </button>

                <Button type="submit" size="md" disabled={!content.trim()} loading={createPost.isPending}>
                  Post Update
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Feed Filter Bar */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2 text-xs">
          <div className="flex items-center gap-1">
            {[
              { id: "all", label: "All Updates" },
              { id: "connections", label: "Connections" },
              { id: "media", label: "Media & Links" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id as typeof filterTab)}
                className={cn(
                  "px-3 py-1.5 rounded-lg font-medium transition-colors",
                  filterTab === tab.id
                    ? "bg-[#0A66C2] text-white"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
            Showing {filteredPosts.length} posts
          </span>
        </div>

        {/* Feed Posts List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <FeedPostSkeleton key={i} />)}
          </div>
        ) : filteredPosts.length > 0 ? (
          <div className="space-y-4">
            {filteredPosts.map((post: Post) => (
              <FeedPostItem
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
          <div className="card-enterprise">
            <EmptyState
              icon={Sparkles}
              title={filterTab === "all" ? "No posts in your feed yet" : `No ${filterTab} posts found`}
              description="Share your first update above or connect with other engineers to see their posts here."
              actionLabel="Find people to follow"
              actionHref="/network"
            />
          </div>
        )}
      </div>

      {/* Right Column Contextual Panel */}
      <div className="lg:col-span-3 space-y-4">
        <RightSidebar />
      </div>
    </div>
  );
}
