import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface AuthorSummary {
  id: string;
  full_name: string;
  avatar_url?: string;
  role: string;
}

export interface Post {
  id: string;
  author_id: string;
  author?: AuthorSummary;
  content: string;
  image_url?: string;
  link_url?: string;
  link_preview_title?: string;
  visibility: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  author?: AuthorSummary;
  content: string;
  created_at: string;
}

export interface FeedResponse {
  posts: Post[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export function useFeed(page = 1, pageSize = 20) {
  const queryClient = useQueryClient();

  const feedQuery = useQuery<FeedResponse>({
    queryKey: ["feed", page, pageSize],
    queryFn: async () => {
      const res = await api.get(`/social/feed?page=${page}&page_size=${pageSize}`);
      return res.data;
    },
  });

  const createPostMutation = useMutation({
    mutationFn: async (payload: { content: string; image_url?: string; link_url?: string; visibility?: string }) => {
      const res = await api.post("/social/posts", payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const likePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      const res = await api.post(`/social/posts/${postId}/like`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      await api.delete(`/social/posts/${postId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  return {
    ...feedQuery,
    createPost: createPostMutation,
    likePost: likePostMutation,
    deletePost: deletePostMutation,
  };
}

export function usePostComments(postId: string, enabled = true) {
  const queryClient = useQueryClient();

  const commentsQuery = useQuery<Comment[]>({
    queryKey: ["postComments", postId],
    queryFn: async () => {
      const res = await api.get(`/social/posts/${postId}/comments`);
      return res.data;
    },
    enabled: enabled && Boolean(postId),
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await api.post(`/social/posts/${postId}/comments`, { content });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["postComments", postId] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await api.delete(`/social/posts/${postId}/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["postComments", postId] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  return {
    ...commentsQuery,
    addComment: addCommentMutation,
    deleteComment: deleteCommentMutation,
  };
}
