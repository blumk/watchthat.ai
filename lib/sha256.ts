import { createHash } from "node:crypto";

// Server-only sha256 hex digest. Used for snapshots.content_hash so we can
// short-circuit re-inserts when a refetch produces identical markdown.
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
