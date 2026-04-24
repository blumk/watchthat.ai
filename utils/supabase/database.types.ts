// Hand-maintained. When the schema grows, regenerate with:
//   supabase gen types typescript --local > utils/supabase/database.types.ts
// Kept manual for now because the schema is small and supabase CLI generation
// requires the local stack to be running.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      pages: {
        Row: {
          id: string;
          url: string;
          label: string;
          last_fetched_at: string | null;
          latest_snapshot_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          url: string;
          label: string;
          last_fetched_at?: string | null;
          latest_snapshot_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pages"]["Insert"]>;
        Relationships: [];
      };
      snapshots: {
        Row: {
          id: string;
          page_id: string;
          fetched_at: string;
          content_hash: string;
          // NULL on hash-equal re-inserts — readers resolve the text via the
          // earliest snapshot with the same (page_id, content_hash).
          markdown: string | null;
          screenshot_path: string | null;
          prev_snapshot_id: string | null;
          change_description: string | null;
          change_classification: "major" | "minor" | "quiet" | "error" | null;
          change_emoji: string | null;
          // Canonicalized fact bag extracted from raw HTML (JSON-LD + meta).
          // Null on pre-facts snapshots and when extraction yields no signal.
          facts: Json | null;
        };
        Insert: {
          id?: string;
          page_id: string;
          fetched_at?: string;
          content_hash: string;
          markdown?: string | null;
          screenshot_path?: string | null;
          prev_snapshot_id?: string | null;
          change_description?: string | null;
          change_classification?: "major" | "minor" | "quiet" | "error" | null;
          change_emoji?: string | null;
          facts?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["snapshots"]["Insert"]>;
        Relationships: [];
      };
      watches: {
        Row: {
          id: string;
          user_id: string;
          page_id: string;
          created_at: string;
          last_seen_snapshot_id: string | null;
          watch_target: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          page_id: string;
          created_at?: string;
          last_seen_snapshot_id?: string | null;
          watch_target?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["watches"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
