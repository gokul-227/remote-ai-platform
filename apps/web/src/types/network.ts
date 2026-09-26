import type { UserRole } from "./user";

/** Public-safe summary of another user, as embedded by the network API (never includes email). */
export interface PersonSummary {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: UserRole;
  engineer_profile_id: string | null;
  headline: string | null;
}

export type ConnectionStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "BLOCKED";

export interface Connection {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: ConnectionStatus;
  created_at: string;
  updated_at: string;
  sender: PersonSummary | null;
  receiver: PersonSummary | null;
}

export interface Conversation {
  id: string;
  participant_one_id: string;
  participant_two_id: string;
  created_at: string;
  updated_at: string;
  other_participant: PersonSummary | null;
  last_message: { content: string; sender_id: string; created_at: string } | null;
  unread_count: number;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read?: boolean;
  created_at: string;
}
