-- Avatar elegido por el propio usuario. No aplicar en remoto sin aprobación.
-- No borra perfiles. Solo el dueño de la sesión puede cambiar su avatar_id.

alter table public.pulse_profiles
  add column if not exists avatar_id text;

alter table public.pulse_profiles
  drop constraint if exists pulse_profiles_avatar_id_check;

alter table public.pulse_profiles
  add constraint pulse_profiles_avatar_id_check
  check (
    avatar_id is null
    or avatar_id in (
      'magallanes', 'leones', 'tigres', 'tiburones',
      'aguilas', 'caribes', 'cardenales', 'bravos'
    )
  );

create or replace function public.pulse_public_profile(profile_row public.pulse_profiles)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', profile_row.id,
    'alias', profile_row.alias,
    'handle', profile_row.handle,
    'initials', profile_row.initials,
    'avatarColor', profile_row.avatar_color,
    'avatarId', profile_row.avatar_id
  );
$$;

create or replace function public.pulse_set_avatar(p_token text, p_avatar_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
begin
  uid := public.pulse_user_id(p_token);
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida.');
  end if;
  if p_avatar_id not in (
    'magallanes', 'leones', 'tigres', 'tiburones',
    'aguilas', 'caribes', 'cardenales', 'bravos'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ese avatar no está disponible.');
  end if;
  update public.pulse_profiles
  set avatar_id = p_avatar_id
  where id = uid;
  return jsonb_build_object('ok', true, 'avatarId', p_avatar_id);
end;
$$;

grant execute on function public.pulse_set_avatar(text, text) to anon, authenticated;
