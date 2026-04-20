-- Watchthis Phase 1 schema: shared pages + snapshots, per-user watches.
-- See plans/supabase-backend-phase-1.md for the full design.

create extension if not exists "pgcrypto";

-- ============================================================================
-- pages: one row per unique URL. Shared across all users.
-- ============================================================================
create table public.pages (
  id                  uuid        primary key default gen_random_uuid(),
  url                 text        not null unique,
  label               text        not null,
  last_fetched_at     timestamptz,
  latest_snapshot_id  uuid,
  created_at          timestamptz not null default now()
);

-- ============================================================================
-- snapshots: append-only history of page content. Shared across all users.
-- ============================================================================
create table public.snapshots (
  id                    uuid        primary key default gen_random_uuid(),
  page_id               uuid        not null references public.pages(id) on delete cascade,
  fetched_at            timestamptz not null default now(),
  content_hash          text        not null,
  markdown              text        not null,
  screenshot_path       text,
  prev_snapshot_id      uuid        references public.snapshots(id) on delete set null,
  change_description    text,
  change_classification text,
  change_emoji          text,
  constraint snapshots_classification_check
    check (change_classification is null
           or change_classification in ('major','minor','quiet','error'))
);

create index snapshots_page_fetched_idx
  on public.snapshots (page_id, fetched_at desc);
create index snapshots_content_hash_idx
  on public.snapshots (content_hash);

-- Deferred FK: pages.latest_snapshot_id -> snapshots.id (circular; added after both tables exist)
alter table public.pages
  add constraint pages_latest_snapshot_fk
  foreign key (latest_snapshot_id) references public.snapshots(id) on delete set null;

-- ============================================================================
-- watches: per-user subscription to a page.
-- ============================================================================
create table public.watches (
  id                     uuid        primary key default gen_random_uuid(),
  user_id                uuid        not null references auth.users(id) on delete cascade,
  page_id                uuid        not null references public.pages(id) on delete cascade,
  created_at             timestamptz not null default now(),
  last_seen_snapshot_id  uuid        references public.snapshots(id) on delete set null,
  watch_target           text,
  unique (user_id, page_id)
);

create index watches_user_idx on public.watches (user_id);

-- ============================================================================
-- RLS: pages/snapshots are world-readable; writes only via service role.
--      watches are strictly user-scoped.
-- ============================================================================
alter table public.pages      enable row level security;
alter table public.snapshots  enable row level security;
alter table public.watches    enable row level security;

create policy "pages are readable by everyone"
  on public.pages for select
  to anon, authenticated
  using (true);

create policy "snapshots are readable by everyone"
  on public.snapshots for select
  to anon, authenticated
  using (true);

create policy "watches are readable by their owner"
  on public.watches for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "watches are insertable by their owner"
  on public.watches for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "watches are updatable by their owner"
  on public.watches for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "watches are deletable by their owner"
  on public.watches for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- pages and snapshots have no anon/authenticated insert/update/delete policies,
-- which means RLS blocks those operations for everyone except the service role
-- (the service-role key bypasses RLS by design).

-- ============================================================================
-- Storage: public-read screenshots bucket.
-- Writes are done via the service-role key from API routes.
-- ============================================================================
insert into storage.buckets (id, name, public)
  values ('screenshots', 'screenshots', true)
  on conflict (id) do nothing;

create policy "screenshots are readable by everyone"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'screenshots');
