-- Update refresh_due_pages() to:
--   1. Send the secret as X-Cron-Secret (NOT Authorization). supabase-ssr's
--      middleware was eating the Authorization header looking for a Supabase
--      JWT before our route handler ever saw it. A custom header doesn't
--      look like a JWT and no middleware has any reason to touch it.
--   2. Include x-vercel-protection-bypass so Vercel's Deployment Protection
--      lets cron-originated requests through to the function.
--
-- ─── REQUIRED NEW VAULT ENTRY ───────────────────────────────────────────
--
--   1. Vercel → Project Settings → Deployment Protection → "Protection
--      Bypass for Automation" → generate a token.
--   2. In Supabase SQL editor:
--        select vault.create_secret('<bypass token>', 'vercel_bypass');
--   3. (Optional but recommended) keep Deployment Protection ON for prod
--      now that the cron knows how to bypass it.
--
-- The function still warns + bails on missing cron_secret / cron_base_url.
-- vercel_bypass is treated as optional — sent as empty string when absent,
-- which lets the function still work in projects that don't have
-- Deployment Protection enabled.

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
        'Content-Type',                'application/json',
        'X-Cron-Secret',               cron_secret,
        'x-vercel-protection-bypass',  coalesce(vercel_bypass, '')
      ),
      body    := jsonb_build_object('pageId', due.id)
    );
  end loop;
end;
$$;
