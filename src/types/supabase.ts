/** Stable response shapes used by the frontend's Supabase-backed features. */
export interface SupabaseResult<T> {
  data: T;
  error: { message: string; code?: string } | null;
}

export interface ProfileRow {
  id: string;
  display_name: string | null;
  elo_rating: number;
  wins: number;
  losses: number;
  progress: Record<string, unknown> | null;
}

export interface DebateTurn {
  speaker: string;
  text: string;
  ts: number;
  spent?: number;
}
