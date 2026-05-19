-- Per-user hidden change-log entries. A swipe (mobile) or × click
-- (desktop) on a history row appends that snapshot's id here, and
-- getSites filters them out at read time. Shared snapshots stay intact
-- for other watchers of the same page.

alter table public.watches
  add column if not exists hidden_snapshot_ids uuid[] not null default '{}';
