"use client";

import { useState } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  Send,
  Trash2,
  Globe,
  Users,
  Lock,
  Image as ImageIcon,
  Link as LinkIcon,
  Sparkles,
  MoreHorizontal,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useFeed, usePostComments, Post, Comment } from "@/hooks/useFeed";

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
    <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Write a comment..."
          className="input-enterprise flex-1 py-1.5 text-xs"
        />
        <button
          type="submit"
          disabled={addComment.isPending || !commentText.trim()}
          className="btn-primary-brand py-1.5 px-3 text-xs disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>

      {isLoading ? (
        <p className="text-xs text-slate-400">Loading comments...</p>
      ) : comments && comments.length > 0 ? (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {comments.map((c: Comment) => (
            <div key={c.id} className="bg-slate-50 rounded-lg p-2.5 text-xs flex justify-between gap-2">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">
                    {c.author?.full_name || "Community Member"}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(c.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-slate-700 leading-relaxed">{c.content}</p>
              </div>
              {currentUserId === c.author_id && (
                <button
                  onClick={() => deleteComment.mutate(c.id)}
                  className="text-slate-400 hover:text-red-600 p-1"
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

function PostCard({ post, currentUserId, onLike, onDelete }: {
  post: Post;
  currentUserId?: string;
  onLike: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [showComments, setShowComments] = useState(false);

  const getVisibilityIcon = (vis: string) => {
    switch (vis) {
      case "CONNECTIONS":
        return <Users className="h-3 w-3 text-slate-400" />;
      case "PRIVATE":
        return <Lock className="h-3 w-3 text-slate-400" />;
      default:
        return <Globe className="h-3 w-3 text-slate-400" />;
    }
  };

  return (
    <div className="card-enterprise p-5 space-y-4">
      {/* Author Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[#0A66C2] text-white font-bold flex items-center justify-center text-sm shadow-xs">
            {post.author?.full_name?.charAt(0).toUpperCase() || "U"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 text-sm">{post.author?.full_name || "Community Member"}</h3>
              <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full uppercase tracking-wider">
                {post.author?.role || "PROFESSIONAL"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
              <span>{new Date(post.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              <span>•</span>
              <span className="flex items-center gap-1">{getVisibilityIcon(post.visibility)} {post.visibility.toLowerCase()}</span>
            </div>
          </div>
        </div>

        {currentUserId === post.author_id && (
          <button
            onClick={() => onDelete(post.id)}
            className="text-slate-400 hover:text-red-600 p-1.5 rounded-md hover:bg-slate-50 transition-colors"
            title="Delete post"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>

      {/* Image Attachment */}
      {post.image_url && (
        <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
          <img src={post.image_url} alt="Post attachment" className="w-full max-h-96 object-cover" />
        </div>
      )}

      {/* Link Attachment */}
      {post.link_url && (
        <a
          href={post.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0A66C2]">
            <LinkIcon className="h-3.5 w-3.5" />
            {post.link_preview_title || post.link_url}
          </div>
          <span className="text-[11px] text-slate-500 truncate block mt-0.5">{post.link_url}</span>
        </a>
      )}

      {/* Engagement Stats & Actions */}
      <div className="border-t border-slate-100 pt-3 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span className="flex items-center gap-1">
            <Heart className={`h-3.5 w-3.5 ${post.liked_by_me ? "fill-red-500 text-red-500" : "text-slate-400"}`} />
            {post.like_count} {post.like_count === 1 ? "like" : "likes"}
          </span>
          <span>{post.comment_count} {post.comment_count === 1 ? "comment" : "comments"}</span>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs font-medium text-slate-600">
          <button
            onClick={() => onLike(post.id)}
            className={`flex items-center justify-center gap-2 flex-1 py-1.5 rounded-md hover:bg-slate-50 transition-colors ${
              post.liked_by_me ? "text-red-600 font-semibold" : ""
            }`}
          >
            <Heart className={`h-4 w-4 ${post.liked_by_me ? "fill-red-600" : ""}`} />
            Like
          </button>
          <button
            onClick={() => setShowComments(!showComments)}
            className="flex items-center justify-center gap-2 flex-1 py-1.5 rounded-md hover:bg-slate-50 transition-colors"
          >
            <MessageCircle className="h-4 w-4 text-slate-400" />
            Comment
          </button>
          <button className="flex items-center justify-center gap-2 flex-1 py-1.5 rounded-md hover:bg-slate-50 transition-colors text-slate-400 cursor-not-allowed">
            <Share2 className="h-4 w-4" />
            Share
          </button>
        </div>
      </div>

      {/* Inline Comments */}
      {showComments && <CommentSection postId={post.id} currentUserId={currentUserId} />}
    </div>
  );
}

export default function SocialFeedPage() {
  const { user } = useAuth();
  const [page] = useState(1);
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
        },
      }
    );
  };

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
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
            <div className="h-9 w-9 rounded-full bg-[#0A66C2] text-white font-bold flex items-center justify-center text-sm">
              {user.full_name?.charAt(0).toUpperCase() || "U"}
            </div>
            <div>
              <span className="font-semibold text-slate-900 text-xs">{user.full_name}</span>
              <div className="flex items-center gap-2 mt-0.5">
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                  className="text-[11px] border border-slate-200 rounded px-2 py-0.5 bg-slate-50 text-slate-700"
                >
                  <option value="PUBLIC">🌐 Public</option>
                  <option value="CONNECTIONS">👥 Connections Only</option>
                  <option value="PRIVATE">🔒 Private</option>
                </select>
              </div>
            </div>
          </div>

          <form onSubmit={handlePostSubmit} className="space-y-3">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What are you building or working on?"
              rows={3}
              className="input-enterprise w-full resize-none text-xs p-3"
            />

            {showMediaInputs && (
              <div className="grid gap-2 sm:grid-cols-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
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

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowMediaInputs(!showMediaInputs)}
                className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-[#0A66C2] transition-colors"
              >
                <ImageIcon className="h-4 w-4 text-[#0A66C2]" />
                <LinkIcon className="h-4 w-4 text-emerald-600" />
                <span>Attach Media / Link</span>
              </button>

              <button
                type="submit"
                disabled={createPost.isPending || !content.trim()}
                className="btn-primary-brand text-xs py-2 px-5 disabled:opacity-50"
              >
                {createPost.isPending ? "Posting..." : "Post Update"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Feed Posts List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card-enterprise p-5 space-y-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-slate-200" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3 w-1/3 bg-slate-200 rounded" />
                  <div className="h-2 w-1/4 bg-slate-100 rounded" />
                </div>
              </div>
              <div className="h-4 w-full bg-slate-200 rounded" />
              <div className="h-4 w-3/4 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : feedData?.posts && feedData.posts.length > 0 ? (
        <div className="space-y-4">
          {feedData.posts.map((post: Post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={user?.id}
              onLike={(id) => likePost.mutate(id)}
              onDelete={(id) => deletePost.mutate(id)}
            />
          ))}
        </div>
      ) : (
        <div className="card-enterprise p-12 text-center space-y-3">
          <div className="h-12 w-12 rounded-full bg-sky-50 text-[#0A66C2] flex items-center justify-center mx-auto">
            <Sparkles className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-slate-900 text-sm">No posts in your feed yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Share your first update above or connect with other engineers to see their posts here.
          </p>
        </div>
      )}
    </div>
  );
}
