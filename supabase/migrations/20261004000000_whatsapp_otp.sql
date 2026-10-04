-- WhatsApp OTP login: city on profiles + hashed challenges + tickets + RPCs
-- Applied remotely as 20261004000000_whatsapp_otp. Keep this file in sync.

create extension if not exists pgcrypto;

alter table public.pulse_profiles
  add column if not exists city text not null default '';

create table if not exists public.pulse_otp_challenges (
  phone text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  send_count integer not null default 0,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.pulse_otp_tickets (
  ticket text primary key,
  phone text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.pulse_internal_config (
  key text primary key,
  value text not null
);

insert into public.pulse_internal_config (key, value)
values ('otp_secret', encode(gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

alter table public.pulse_otp_challenges enable row level security;
alter table public.pulse_otp_tickets enable row level security;
alter table public.pulse_internal_config enable row level security;
