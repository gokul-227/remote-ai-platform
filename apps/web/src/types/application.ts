import type { JobPost } from "./job";

export type ApplicationStatus = "SUBMITTED" | "APPLIED" | "REVIEWING" | "SHORTLISTED" | "INVITED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";

export interface JobApplication {
  id: string;
  user_id: string;
  job_id: string;
  status: ApplicationStatus;
  cover_note?: string | null;
  created_at: string;
  updated_at: string;
}

/** GET /applications/me row. */
export interface MyApplication {
  application: JobApplication;
  job: JobPost;
}

export const ACTIVE_APPLICATION: ApplicationStatus[] = ["SUBMITTED", "APPLIED", "REVIEWING", "SHORTLISTED", "INVITED"];
