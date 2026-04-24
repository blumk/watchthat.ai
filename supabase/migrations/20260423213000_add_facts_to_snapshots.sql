-- Add a structured-data "fact bag" to snapshots.
--
-- We now ask Firecrawl for raw HTML in addition to markdown, then extract a
-- safelisted projection of JSON-LD (schema.org) + OpenGraph/Twitter meta
-- into a flat { "Type.path": "value" } bag. That projection participates in
-- the content hash so factual changes (4.5 → 4.4 rating, 1217 → 1243
-- reviews, price moves, availability flips) trigger a new snapshot even
-- when the rendered markdown looks identical because it rounds or abbreviates.
--
-- Nullable so old snapshots stay valid; extraction also yields null when
-- the page has no JSON-LD / safelisted meta.

alter table public.snapshots add column facts jsonb;
