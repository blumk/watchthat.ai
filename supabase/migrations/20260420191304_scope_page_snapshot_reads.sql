-- Scope pages and snapshots SELECT to the caller's own watches.
--
-- Before: any anon JWT could `select * from pages` (or snapshots) and
--         enumerate every URL anyone had ever added to WatchThat globally.
-- After:  only users with a watch on a page can read that page's row or
--         its snapshots.
--
-- Service-role writes from /api/scrape and /api/watches bypass RLS, so the
-- upsert-page → create-watch flow is unaffected. Client reads via
-- lib/db.getSites filter by the caller's watches first (watches RLS scopes
-- to auth.uid()), so the join still resolves.

drop policy if exists "pages are readable by everyone"     on public.pages;
drop policy if exists "snapshots are readable by everyone" on public.snapshots;

create policy "pages are readable by subscribers"
  on public.pages for select
  to authenticated
  using (
    id in (
      select page_id from public.watches
      where user_id = (select auth.uid())
    )
  );

create policy "snapshots are readable by subscribers"
  on public.snapshots for select
  to authenticated
  using (
    page_id in (
      select page_id from public.watches
      where user_id = (select auth.uid())
    )
  );
