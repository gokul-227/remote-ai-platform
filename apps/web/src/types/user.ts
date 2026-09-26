export type UserRole = "ENGINEER" | "COMPANY" | "ADMIN";

export interface UserSummary {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  role?: UserRole | string;
  headline?: string | null;
}

export interface EngineerProfile {
  id: string;
  user_id?: string;
  full_name: string;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  timezone?: string | null;
  years_experience?: number | null;
  skills?: string[];
  is_open_to_work?: boolean;
  is_verified?: boolean;
  avatar_url?: string | null;
  primary_role?: string | null;
  hourly_rate?: number | null;
  resume_url?: string | null;
}

export interface CompanyProfile {
  id: string;
  user_id?: string;
  name: string;
  logo_url?: string | null;
  industry?: string | null;
  company_size?: string | null;
  description?: string | null;
  location?: string | null;
  country?: string | null;
  website?: string | null;
  hiring_status?: string | null;
  tech_stack?: string[];
  is_verified?: boolean;
  created_at?: string;
  updated_at?: string;
}
