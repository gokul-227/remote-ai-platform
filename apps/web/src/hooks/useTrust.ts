import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface ScoreFactor {
  category: string;
  points: number;
  max: number;
  detail: string;
}

export interface TrustScore {
  user_id: string;
  overall_score: number;
  completion_rate: number;
  on_time_rate: number;
  rating_avg: number;
  review_count: number;
  verified_skills_count: number;
  score_breakdown: {
    score: number;
    factors: ScoreFactor[];
    last_calculated: string;
  };
  updated_at: string;
}

export interface VerificationBadge {
  id: string;
  user_id: string;
  verification_type: string;
  status: string;
  verifier_notes?: string;
  verified_at?: string;
  created_at: string;
}

export interface ProjectReviewItem {
  id: string;
  project_id: string;
  reviewer_id: string;
  reviewee_id: string;
  reviewer?: {
    id: string;
    full_name: string;
    role: string;
  };
  rating: number;
  comment: string;
  created_at: string;
}

export function useTrustScore(userId?: string, enabled = true) {
  return useQuery<TrustScore>({
    queryKey: ["trustScore", userId],
    queryFn: async () => {
      const res = await api.get(`/trust/scores/${userId}`);
      return res.data;
    },
    enabled: enabled && Boolean(userId),
  });
}

export function useUserReviews(userId?: string, enabled = true) {
  return useQuery<ProjectReviewItem[]>({
    queryKey: ["userReviews", userId],
    queryFn: async () => {
      const res = await api.get(`/trust/reviews/${userId}`);
      return res.data;
    },
    enabled: enabled && Boolean(userId),
  });
}

export function useUserVerifications(userId?: string, enabled = true) {
  return useQuery<VerificationBadge[]>({
    queryKey: ["userVerifications", userId],
    queryFn: async () => {
      const res = await api.get(`/trust/verifications/${userId}`);
      return res.data;
    },
    enabled: enabled && Boolean(userId),
  });
}

export function useSubmitReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { project_id: string; reviewee_id: string; rating: number; comment: string }) => {
      const res = await api.post("/trust/reviews", payload);
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["trustScore", variables.reviewee_id] });
      queryClient.invalidateQueries({ queryKey: ["userReviews", variables.reviewee_id] });
    },
  });
}

export function useAddVerification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { verification_type: string; verifier_notes?: string }) => {
      const res = await api.post("/trust/verifications", payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["trustScore", data.user_id] });
      queryClient.invalidateQueries({ queryKey: ["userVerifications", data.user_id] });
    },
  });
}
