-- Switch refresh_due_pages() to read its HTTP token and base URL from
-- Supabase Vault instead of database-level settings. Hosted Supabase
-- doesn't grant ALTER DATABASE to the SQL-editor role, so the original
-- current_setting('app.cron_secret') approach can't be configured there.
--
-- ─── ONE-TIME SETUP (Supabase SQL editor) ───────────────────────────────
--
--   select vault.create_secret('<openssl rand -hex 32>', 'cron_secret');
--   select vault.create_secret('https://watchthat.ai',  'cron_base_url');
--
-- Set CRON_SECRET in Vercel env vars to the same value as the
-- 'cron_secret' Vault entry. To rotate later, use vault.update_secret().
--
-- Until both Vault entries exist the cron function logs a warning and
-- no-ops — safe to apply this migration before populating Vault.

create or replace function public.refresh_due_pages()
returns void language plpgsql security definer as $$
declare
  due record;
  cron_secret text;
  base_url text;
begin
  select decrypted_secret into cron_secret
    from vault.decrypted_secrets where name = 'cron_secret';
  select decrypted_secret into base_url
    from vault.decrypted_secrets where name = 'cron_base_url';
  if coalesce(cron_secret, '') = '' or coalesce(base_url, '') = '' then
    raise warning
      'refresh_due_pages: cron_secret / cron_base_url not in Vault — skipping';
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
