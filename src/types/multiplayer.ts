/** Typed model for the live match state exchanged over Supabase Realtime. */
export interface MultiplayerPlayer {
  uid: string;
  displayName: string;
  eloRating: number;
}

export interface MultiplayerTurn {
  uid: string;
  text: string;
  created_at: string;
}

export interface MultiplayerState {
  id: string;
  topic: string;
  players: string[];
  player_order: string[];
  turn_index: number;
  turns: MultiplayerTurn[];
  status: "active" | "finished" | "abandoned";
}
