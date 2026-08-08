import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export interface CandidateMatch {
  engineer_id: string;
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
}

export function useCandidateMatches(jobId: string) {
  return useQuery<CandidateMatch[]>({
    queryKey: ["candidate-matches", jobId],
    queryFn: async () => (await api.get(`/matching/candidates/${jobId}`)).data,
    enabled: Boolean(jobId),
  });
}
