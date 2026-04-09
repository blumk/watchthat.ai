# TODO

Pending work tracked across sessions. Remove items when done.

## Supabase hardening

- [ ] **Enable captcha on anon sign-ins.** Supabase dashboard → Authentication → Sign In / Providers → enable hCaptcha or Cloudflare Turnstile. Anon sign-ups are a cheap spam vector; every call creates a row in `auth.users`.
- [ ] **Audit RLS for the `is_anonymous` JWT claim before adding any "authenticated-only" feature.** Anonymous users sign in with the `authenticated` Postgres role, so a policy written `to authenticated` covers them too. When we add features that should exclude anon users (billing, admin, paid tiers), gate them with `(auth.jwt() ->> 'is_anonymous')::boolean = false`. Current tables (`pages` public-read, `snapshots` public-read, `watches` scoped by `auth.uid()`) are fine as-is.
- [ ] **Plan the anon → real-user upgrade flow.** When we add email/OAuth signup, use `supabase.auth.updateUser({ email })` on the existing anon session so `uid` is preserved and their `watches` rows carry over. No data migration needed if we do it this way.
