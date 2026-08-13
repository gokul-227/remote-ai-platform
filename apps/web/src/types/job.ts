export interface JobPost {
  id: string;
  company_id?: string | null;
  slug: string;
  title: string;
  description: string;
  company_name?: string | null;
  company_logo?: string | null;
  location?: string | null;
  is_remote: boolean;
  job_type: string;
  experience_level?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  timeline?: string | null;
  remote_preference?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  currency: string;
  skills: string[];
  external_url?: string | null;
  source: string;
  is_active: boolean;
  posted_at: string;
  created_at: string;
  updated_at: string;
  ai_analysis?: Record<string, unknown> | null;
  match_score?: number;
}
