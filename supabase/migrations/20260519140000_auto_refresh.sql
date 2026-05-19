-- Auto-refresh for watched pages.
--
-- Per-user refresh_interval_seconds lives on `watches` (default 24h, floor
-- 1h). Each `pages` row carries a `next_due_at` that's kept in sync by
-- triggers: after a snapshot lands or a watch changes, we recompute
-- next_due_at = base + min(refresh_interval_seconds) across all watchers.
-- When a page has no watchers, next_due_at goes NULL so the cron skips it.
--
-- A pg_cron job (every 5 minutes) selects pages whose next_due_at is in the
-- past, claims them by pushing next_due_at forward by 10 minutes, and fires
-- an HTTP POST to /api/cron/scrape via pg_net — that route delegates back to
-- the existing /api/scrape pipeline for one page at a time.
--
-- ─── POST-MIGRATION SETUP (one-time, in the Supabase SQL editor) ───
--
--   alter database postgres set app.cron_secret = '<openssl rand -hex 32>';
--   alter database postgres set app.base_url    = 'https://watchthat.ai';
--
-- Then add the same secret to Vercel:  CRON_SECRET=<same value>
--
-- The cron job only fires HTTP when both settings are populated; until then
-- it logs a warning and no-ops, so the migration is safe to apply first.

-- 1. Extensions ──────────────────────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Columns ─────────────────────────────────────────────────────────────
alter table public.watches
  add column if not exists refresh_interval_seconds int not null default 86400;

-- Floor at 1 hour. WatchSetup's chips already top out at hourly; this stops
-- a programmatic caller from setting "every 60 seconds" and burning quota.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'watches_refresh_interval_floor'
  ) then
    alter table public.watches
      add constraint watches_refresh_interval_floor
      check (refresh_interval_seconds >= 3600);
  end if;
end $$;

alter table public.pages
  add column if not exists next_due_at timestamptz;

-- Backfill: stagger over the next 24h so the cron doesn't stampede all
-- existing pages the moment it goes live.
update public.pages
  set next_due_at = coalesce(last_fetched_at, now()) + (random() * interval '24 hours')
  where next_due_at is null;

create index if not exists pages_next_due_at_idx
  on public.pages (next_due_at)
  where next_due_at is not null;

-- 3. Triggers ────────────────────────────────────────────────────────────
--
-- After every snapshot insert, recompute the page's next_due_at to
-- (snapshot fetch time) + min(refresh_interval_seconds across all
-- watchers). If the page has no watchers, set next_due_at to NULL so the
-- cron stops polling it.
create or replace function public.bump_page_next_due_at_after_snapshot()
returns trigger language plpgsql as $$
declare
  min_secs int;
begin
  select min(refresh_interval_seconds) into min_secs
    from public.watches where page_id = new.page_id;
  if min_secs is null then
    update public.pages set next_due_at = null where id = new.page_id;
  else
    update public.pages
      set next_due_at = new.fetched_at + make_interval(secs => min_secs)
      where id = new.page_id;
  end if;
  return new;
end;
$$;

drop trigger if exists snapshots_bump_next_due_at on public.snapshots;
create trigger snapshots_bump_next_due_at
  after insert on public.snapshots
  for each row execute function public.bump_page_next_due_at_after_snapshot();

-- When a watch is inserted, has its interval changed, or is deleted,
-- recompute next_due_at on its page using the page's last_fetched_at as the
-- base (or now() if the page has never been scraped). A brand-new watch on
-- an old page lands with a next_due_at in the past — the cron will pick it
-- up on the next tick and the user gets a fresh snapshot.
create or replace function public.bump_page_next_due_at_after_watch_change()
returns trigger language plpgsql as $$
declare
  target_page_id uuid;
  min_secs int;
  last_fetched timestamptz;
begin
  target_page_id := coalesce(new.page_id, old.page_id);
  select min(refresh_interval_seconds) into min_secs
    from public.watches where page_id = target_page_id;
  select last_fetched_at into last_fetched
    from public.pages where id = target_page_id;
  if min_secs is null then
    update public.pages set next_due_at = null where id = target_page_id;
  else
    update public.pages
      set next_due_at = coalesce(last_fetched, now()) + make_interval(secs => min_secs)
      where id = target_page_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists watches_bump_next_due_at on public.watches;
create trigger watches_bump_next_due_at
  after insert or update of refresh_interval_seconds or delete
  on public.watches
  for each row execute function public.bump_page_next_due_at_after_watch_change();

-- 4. Cron driver ─────────────────────────────────────────────────────────
--
-- Picks up to 25 due pages per run, claims each by pushing next_due_at
-- forward by 10 minutes, then fires an async HTTP POST via pg_net. The
-- 10-minute claim acts as a retry window: if the Vercel call never lands
-- (network blip, deploy in flight), the page becomes due again 10 minutes
-- later. Real scrape completion writes a fresh next_due_at via the
-- snapshot-insert trigger above.
create or replace function public.refresh_due_pages()
returns void language plpgsql security definer as $$
declare
  due record;
  cron_secret text;
  base_url text;
begin
  cron_secret := current_setting('app.cron_secret', true);
  base_url    := current_setting('app.base_url',    true);
  if coalesce(cron_secret, '') = '' or coalesce(base_url, '') = '' then
    raise warning
      'refresh_due_pages: app.cron_secret or app.base_url not configured — skipping';
    return;
  end if;

  for due in
    select p.id from public.pages p
    where p.next_due_at <= now()
      and exists (select 1 from public.watches w where w.page_id = p.id)
    order by p.next_due_at
    limit 25
    for update of p skip locked
  loop
    update public.pages set next_due_at = now() + interval '10 minutes'
      where id = due.id;
    perform net.http_post(
      url     := base_url || '/api/cron/scrape',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || cron_secret
      ),
      body    := jsonb_build_object('pageId', due.id)
    );
  end loop;
end;
$$;

-- 5. Schedule ────────────────────────────────────────────────────────────
do $$ begin
  if exists (select 1 from cron.job where jobname = 'refresh-due-pages') then
    perform cron.unschedule('refresh-due-pages');
  end if;
end $$;
select cron.schedule(
  'refresh-due-pages',
  '*/5 * * * *',
  $$ select public.refresh_due_pages(); $$
);
