-- Drop the unused last_seen_snapshot_id column from watches.
--
-- Scaffolded in the init migration for a hypothetical unread-marker
-- feature, but never read or written by any application code. Removing
-- the dead weight; reintroduce a column (or a derived view) when an
-- unread feature actually lands.

alter table public.watches drop column if exists last_seen_snapshot_id;
