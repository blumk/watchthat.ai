-- Free-form user notes refining what to track on the watched page. Surfaced
-- to describeChange on every scrape so a user can teach the model what
-- "General Admission ticket price" actually means on a noisy page — and
-- have the correction stick across all future runs without re-explaining.
--
-- Nullable so existing watches keep working unchanged.

alter table public.watches add column if not exists target_notes text;
