-- Per-watch pause flag: when set, this user's watch is ignored by the
-- refresh cron, but the watch row + history stay intact (different from
-- removing the watch entirely). When *every* watcher of a page is paused,
-- pages.next_due_at goes NULL and the page is skipped — matching how the
-- "no watchers at all" case is already handled.
--
-- Re-defines the triggers and refresh_due_pages() to filter on `not
-- paused` everywhere they previously considered any watcher.

alter table public.watches
  add column if not exists paused boolean not null default false;

-- After every snapshot insert, recompute the page's next_due_at to
-- (snapshot fetch time) + min(refresh_interval_seconds across ACTIVE
-- watchers). Paused watchers are ignored. NULL when no active watchers.
create or replace function public.bump_page_next_due_at_after_snapshot()
returns trigger language plpgsql as $$
declare
  min_secs int;
begin
  select min(refresh_interval_seconds) into min_secs
    from public.watches where page_id = new.page_id and not paused;
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

-- Watch insert/update/delete recomputes next_due_at the same way. Adds
-- `paused` to the UPDATE trigger column list so toggling pause re-runs
-- the function and updates next_due_at appropriately.
create or replace function public.bump_page_next_due_at_after_watch_change()
returns trigger language plpgsql as $$
declare
  target_page_id uuid;
  min_secs int;
  last_fetched timestamptz;
begin
  target_page_id := coalesce(new.page_id, old.page_id);
  select min(refresh_interval_seconds) into min_secs
    from public.watches where page_id = target_page_id and not paused;
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
  after insert
     or update of refresh_interval_seconds, paused
     or delete
  on public.watches
  for each row execute function public.bump_page_next_due_at_after_watch_change();

-- Cron driver also needs to skip pages whose only remaining watchers are
-- paused (defense-in-depth — the trigger should already have set
-- next_due_at to NULL, but the filter survives any drift).
create or replace function public.refresh_due_pages()
returns void language plpgsql security definer as $$
declare
  due record;
  cron_secret text;
  base_url text;
  vercel_bypass text;
begin
  select decrypted_secret into cron_secret
    from vault.decrypted_secrets where name = 'cron_secret';
  select decrypted_secret into base_url
    from vault.decrypted_secrets where name = 'cron_base_url';
  select decrypted_secret into vercel_bypass
    from vault.decrypted_secrets where name = 'vercel_bypass';
  if coalesce(cron_secret, '') = '' or coalesce(base_url, '') = '' then
    raise warning
      'refresh_due_pages: cron_secret / cron_base_url not in Vault — skipping';
    return;
  end if;

  for due in
    select p.id from public.pages p
    where p.next_due_at <= now()
      and exists (
        select 1 from public.watches w
        where w.page_id = p.id and not w.paused
      )
    order by p.next_due_at
    limit 25
    for update of p skip locked
  loop
    update public.pages set next_due_at = now() + interval '10 minutes'
      where id = due.id;
    perform net.http_post(
      url     := base_url || '/api/cron/scrape',
      headers := jsonb_build_object(
        'Content-Type',                'application/json',
        'X-Cron-Secret',               cron_secret,
        'x-vercel-protection-bypass',  coalesce(vercel_bypass, '')
      ),
      body    := jsonb_build_object('pageId', due.id)
    );
  end loop;
end;
$$;

-- One-shot: recompute next_due_at for every page so any pre-existing
-- all-paused-watchers (none yet — column is brand new) goes NULL. Safe
-- no-op since the column defaults to false.
update public.pages p
   set next_due_at = (
     select coalesce(p.last_fetched_at, now()) + make_interval(secs => min(w.refresh_interval_seconds))
     from public.watches w
     where w.page_id = p.id and not w.paused
   );
