import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

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
  job?: {
    id: string;
    title: string;
    company_name: string;
    location: string | null;
    salary_min: number | null;
    salary_max: number | null;
    currency: string | null;
    remote_type: string | null;
    required_skills: string[];
    employment_type: string | null;
    description: string;
    source_url: string | null;
  };
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
