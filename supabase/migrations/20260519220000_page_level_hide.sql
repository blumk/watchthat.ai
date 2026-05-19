-- Page-level hidden_snapshot_ids: a snapshot id added here is filtered out
-- of every reader — watchers' getSites AND the public /p/<id> share page.
--
-- Replaces the previous per-watcher watches.hidden_snapshot_ids approach
-- which only hid from the dismissing user and was confusing because share
-- links ignored it. We keep that column around for one migration to avoid
-- data loss; new code only reads/writes pages.hidden_snapshot_ids.

alter table public.pages
  add column if not exists hidden_snapshot_ids uuid[] not null default '{}';
