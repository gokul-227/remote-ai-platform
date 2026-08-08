import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

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
      return apiClient.get(`/groups?${p.toString()}`).then((r) => r.data);
    },
  });
}

export function useMyGroups() {
  return useQuery<GroupListResponse>({
    queryKey: ["groups", "me"],
    queryFn: () => apiClient.get("/groups/me/joined").then((r) => r.data),
  });
}

export function useGroup(groupId: string) {
  return useQuery<Group>({
    queryKey: ["group", groupId],
    queryFn: () => apiClient.get(`/groups/${groupId}`).then((r) => r.data),
    enabled: !!groupId,
  });
}

export function useGroupPosts(groupId: string) {
  return useQuery<GroupPostListResponse>({
    queryKey: ["group-posts", groupId],
    queryFn: () => apiClient.get(`/groups/${groupId}/posts`).then((r) => r.data),
    enabled: !!groupId,
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; category: string; tags: string[]; is_private: boolean }) =>
      apiClient.post("/groups", data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useJoinGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => apiClient.post(`/groups/${groupId}/join`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["group"] });
    },
  });
}

export function useLeaveGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => apiClient.post(`/groups/${groupId}/leave`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["group"] });
    },
  });
}

export function useCreateGroupPost(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => apiClient.post(`/groups/${groupId}/posts`, { content }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-posts", groupId] });
    },
  });
}

export function useDeleteGroupPost(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => apiClient.delete(`/groups/${groupId}/posts/${postId}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-posts", groupId] });
    },
  });
}
