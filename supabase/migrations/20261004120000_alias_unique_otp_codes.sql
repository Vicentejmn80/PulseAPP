-- Applied on the remote project.
-- alias_normalized is unique and case-insensitive.
-- Historical duplicates keep their display alias; only the oldest row keeps
-- the canonical key. Later copies received a stable suffix.
-- OTP hashing uses pgcrypto, which lives in the extensions schema.

alter table public.pulse_profiles
  add column if not exists alias_normalized text;

create unique index if not exists pulse_profiles_alias_normalized_key
  on public.pulse_profiles (alias_normalized);

alter function public.pulse_otp_issue(text, text, text) set search_path = public, extensions;
alter function public.pulse_otp_consume(text, text) set search_path = public, extensions;
