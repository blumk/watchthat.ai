-- Allow snapshots.markdown to be NULL.
--
-- Rationale: past the 5-min dedup window we still insert a new snapshot row on
-- every /api/scrape hit (keeps the screenshot fresh + makes last_fetched_at
-- align with a real row). When the content hash matches the previous snapshot,
-- the markdown column is a byte-for-byte duplicate of an earlier row. For a
-- stable page, that balloons the DB with redundant text.
--
-- After this migration, the scrape route writes markdown = NULL on hash-equal
-- inserts and readers resolve the actual text via the earliest prior snapshot
-- with the same (page_id, content_hash).

alter table public.snapshots alter column markdown drop not null;
