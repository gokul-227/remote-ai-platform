/** GET /engineers/me — the signed-in engineer's full profile. */
export interface MyEngineerProfile {
  id: string;
  user_id: string;
  full_name?: string | null;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  country?: string | null;
  timezone?: string | null;
  availability?: string | null;
  remote_preference?: string | null;
  years_of_experience: number;
  primary_role?: string | null;
  employment_type?: string | null;
  hourly_rate?: number | null;
  desired_salary_min?: number | null;
  languages: string[];
  github_url?: string | null;
  linkedin_url?: string | null;
  portfolio_url?: string | null;
  profile_image_url?: string | null;
  skills: string[];
  experience: Array<{ company: string; title: string; start_date: string; end_date?: string | null; is_current?: boolean; description?: string | null; technologies?: string[] }>;
  projects: Array<{ title: string; description: string; url?: string | null; github_url?: string | null; technologies?: string[] }>;
  education: Array<{ institution: string; degree: string; field_of_study?: string | null; start_year?: number | null; end_year?: number | null }>;
  certifications: Array<Record<string, unknown>>;
  previous_companies: string[];
  is_open_to_work?: boolean;
  is_verified?: boolean;
  resume_url?: string | null;
  parsed_resume_data?: Record<string, unknown> | null;
  ai_summary?: string | null;
  profile_score?: number | null;
  missing_skills: string[];
  created_at: string;
  updated_at: string;
}
