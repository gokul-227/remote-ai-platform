import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { JobPost } from "@/types";

export interface JobMatch {
  id: string;
  engineer_id: string;
  job_id: string;
  overall_score: number;
  skill_score: number;
  experience_score: number;
  role_score: number;
  timezone_score: number;
  availability_score: number;
  compensation_score: number;
  remote_score: number;
  reasoning: string;
  matching_skills: string[];
  missing_skills: string[];
  status: string;
  created_at: string;
  updated_at: string;
  job?: JobPost;
}

export function useRecommendations(limit = 20) {
  return useQuery<JobMatch[]>({
    queryKey: ["recommendations", limit],
    queryFn: async () => (await api.get(`/matching/recommendations?limit=${limit}`)).data,
  });
}

export function useUpdateMatchStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ matchId, status }: { matchId: string; status: string }) =>
      api.patch(`/matching/${matchId}/status`, { status }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}
