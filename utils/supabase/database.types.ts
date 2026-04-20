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
      };
      snapshots: {
        Row: {
          id: string;
          page_id: string;
          fetched_at: string;
          content_hash: string;
          markdown: string;
          screenshot_path: string | null;
          prev_snapshot_id: string | null;
          change_description: string | null;
          change_classification: "major" | "minor" | "quiet" | "error" | null;
          change_emoji: string | null;
        };
        Insert: {
          id?: string;
          page_id: string;
          fetched_at?: string;
          content_hash: string;
          markdown: string;
          screenshot_path?: string | null;
          prev_snapshot_id?: string | null;
          change_description?: string | null;
          change_classification?: "major" | "minor" | "quiet" | "error" | null;
          change_emoji?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["snapshots"]["Insert"]>;
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
      };
    };
  };
};
