import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface Group {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  tags: string[];
  avatar_url: string | null;
  banner_url: string | null;
  is_private: boolean;
  is_verified: boolean;
  member_count: number;
  post_count: number;
  owner_id: string | null;
  created_at: string;
  is_member: boolean;
  my_role: string | null;
}

export interface GroupPost {
  id: string;
  group_id: string;
  author_id: string;
  content: string;
  media_urls: string[];
  like_count: number;
  comment_count: number;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

interface GroupListResponse {
  groups: Group[];
  total: number;
  page: number;
  page_size: number;
}

interface GroupPostListResponse {
  posts: GroupPost[];
  total: number;
  page: number;
  page_size: number;
}

export function useGroups(params?: { category?: string; search?: string; page?: number }) {
  return useQuery<GroupListResponse>({
    queryKey: ["groups", params],
    queryFn: () => {
      const p = new URLSearchParams();
      if (params?.category) p.set("category", params.category);
      if (params?.search) p.set("search", params.search);
      if (params?.page) p.set("page", String(params.page));
      return api.get(`/groups?${p.toString()}`).then((r: { data: GroupListResponse }) => r.data);
    },
  });
}

export function useMyGroups() {
  return useQuery<GroupListResponse>({
    queryKey: ["groups", "me"],
    queryFn: () => api.get("/groups/me/joined").then((r: { data: GroupListResponse }) => r.data),
  });
}

export function useGroup(groupId: string) {
  return useQuery<Group>({
    queryKey: ["group", groupId],
    queryFn: () => api.get(`/groups/${groupId}`).then((r: { data: Group }) => r.data),
    enabled: !!groupId,
  });
}

export function useGroupPosts(groupId: string) {
  return useQuery<GroupPostListResponse>({
    queryKey: ["group-posts", groupId],
    queryFn: () => api.get(`/groups/${groupId}/posts`).then((r: { data: GroupPostListResponse }) => r.data),
    enabled: !!groupId,
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; category: string; tags: string[]; is_private: boolean }) =>
      api.post("/groups", data).then((r: { data: Group }) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useJoinGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => api.post(`/groups/${groupId}/join`).then((r: { data: unknown }) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["group"] });
    },
  });
}

export function useLeaveGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => api.post(`/groups/${groupId}/leave`).then((r: { data: unknown }) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["group"] });
    },
  });
}

export function useCreateGroupPost(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => api.post(`/groups/${groupId}/posts`, { content }).then((r: { data: GroupPost }) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-posts", groupId] });
    },
  });
}

export function useDeleteGroupPost(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => api.delete(`/groups/${groupId}/posts/${postId}`).then((r: { data: unknown }) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-posts", groupId] });
    },
  });
}

