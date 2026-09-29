-- Student Hub: tabella per i dati di ogni utente.
-- Da incollare una volta in Supabase → SQL Editor → New query → Run.

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security: ogni utente vede e modifica solo la propria riga.
alter table public.user_data enable row level security;

drop policy if exists "user_data_select_own" on public.user_data;
drop policy if exists "user_data_insert_own" on public.user_data;
drop policy if exists "user_data_update_own" on public.user_data;
drop policy if exists "user_data_delete_own" on public.user_data;

create policy "user_data_select_own" on public.user_data
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "user_data_insert_own" on public.user_data
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "user_data_update_own" on public.user_data
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "user_data_delete_own" on public.user_data
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Spazio file dell'Archivio (PDF, foto, appunti): bucket privato "archive".
-- Ogni utente può usare solo la cartella con il proprio id (archive/<user id>/...).

insert into storage.buckets (id, name, public, file_size_limit)
values ('archive', 'archive', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "archive_select_own" on storage.objects;
drop policy if exists "archive_insert_own" on storage.objects;
drop policy if exists "archive_update_own" on storage.objects;
drop policy if exists "archive_delete_own" on storage.objects;

create policy "archive_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'archive' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "archive_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'archive' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "archive_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'archive' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'archive' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "archive_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'archive' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Chat della Guida Studio AI, salvate per materia e argomento.

create table if not exists public.chats (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject    text not null default '',
  topic      text not null default '',
  title      text not null default 'Nuova chat',
  messages   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chats_user_updated on public.chats (user_id, updated_at desc);

alter table public.chats enable row level security;

drop policy if exists "chats_select_own" on public.chats;
drop policy if exists "chats_insert_own" on public.chats;
drop policy if exists "chats_update_own" on public.chats;
drop policy if exists "chats_delete_own" on public.chats;

create policy "chats_select_own" on public.chats
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "chats_insert_own" on public.chats
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "chats_update_own" on public.chats
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "chats_delete_own" on public.chats
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Statistiche per lo sviluppatore (pagina "Sviluppatori").
-- Tutti possono SCRIVERE i propri eventi (anche chi non ha fatto login, ad es. la pagina di
-- accesso); solo l'account sviluppatore può LEGGERE i dati aggregati, tramite admin_dashboard().

create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users (id) on delete set null,
  visitor_id  text not null,
  session_id  text not null,
  event       text not null check (event in ('visit', 'section_view', 'section_time', 'ai_message', 'file_upload', 'signup')),
  section     text,
  seconds     integer not null default 0 check (seconds between 0 and 3600),
  device      text,
  created_at  timestamptz not null default now()
);

create index if not exists analytics_events_created on public.analytics_events (created_at);
create index if not exists analytics_events_user on public.analytics_events (user_id, created_at);

alter table public.analytics_events enable row level security;

drop policy if exists "analytics_insert_own" on public.analytics_events;
create policy "analytics_insert_own" on public.analytics_events
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
-- Nessuna policy di lettura: i dati si leggono solo con admin_dashboard().

create or replace function public.is_developer()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid()
      and lower(email) = 'flowbase.service@gmail.com'
      and email_confirmed_at is not null
  );
$$;

create or replace function public.admin_dashboard(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
  result jsonb;
begin
  if not public.is_developer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- The developer's own use of the site is left out, so testing doesn't inflate the numbers.
  with ev as (
    select * from public.analytics_events
    where created_at >= since and (user_id is null or user_id <> auth.uid())
  ),
  per_user as (
    select user_id, sum(seconds) filter (where event = 'section_time') as secs,
           count(distinct session_id) as sessions, max(created_at) as last_seen
    from ev where user_id is not null group by user_id
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'visitors_all', (select count(distinct visitor_id) from public.analytics_events where user_id is null or user_id <> auth.uid()),
      'visitors', (select count(distinct visitor_id) from ev),
      'sessions', (select count(distinct session_id) from ev),
      'registered_users', (select count(*) from auth.users),
      'new_users', (select count(*) from auth.users where created_at >= since),
      'active_1d', (select count(distinct user_id) from ev where created_at >= now() - interval '1 day'),
      'active_7d', (select count(distinct user_id) from ev where created_at >= now() - interval '7 days'),
      'active_period', (select count(distinct user_id) from ev),
      'total_seconds', (select coalesce(sum(seconds), 0) from ev where event = 'section_time'),
      'avg_seconds_per_user', (select coalesce(round(avg(secs)), 0) from per_user),
      'avg_seconds_per_session', (
        select coalesce(round(sum(seconds)::numeric / nullif(count(distinct session_id), 0)), 0)
        from ev where event = 'section_time'),
      'ai_messages', (select count(*) from ev where event = 'ai_message'),
      'file_uploads', (select count(*) from ev where event = 'file_upload')
    ),
    'sections', coalesce((
      select jsonb_agg(s order by s.seconds desc) from (
        select section,
               count(*) filter (where event = 'section_view') as views,
               coalesce(sum(seconds) filter (where event = 'section_time'), 0) as seconds,
               count(distinct user_id) as users
        from ev where section is not null group by section
      ) s), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(d order by d.day) from (
        select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
               count(distinct visitor_id) as visitors,
               count(distinct user_id) as users,
               coalesce(sum(seconds) filter (where event = 'section_time'), 0) as seconds
        from ev group by 1
      ) d), '[]'::jsonb),
    'signups', coalesce((
      select jsonb_agg(d order by d.day) from (
        select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*) as users
        from auth.users where created_at >= since group by 1
      ) d), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(d order by d.visitors desc) from (
        select coalesce(device, 'sconosciuto') as device, count(distinct visitor_id) as visitors
        from ev where event = 'visit' group by 1
      ) d), '[]'::jsonb),
    'users', coalesce((
      select jsonb_agg(u order by u.seconds desc nulls last) from (
        select au.email, au.created_at, pu.last_seen, coalesce(pu.secs, 0) as seconds, coalesce(pu.sessions, 0) as sessions
        from auth.users au left join per_user pu on pu.user_id = au.id
        order by coalesce(pu.secs, 0) desc, au.created_at desc
        limit 200
      ) u), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_dashboard(integer) from public, anon;
grant execute on function public.admin_dashboard(integer) to authenticated;
grant execute on function public.is_developer() to authenticated;

-- ---------------------------------------------------------------------------
-- Approvazione degli utenti (pannello Admin).
-- Ogni account ha uno stato: pending (in attesa), approved, rejected, blocked.
-- Solo gli account approvati possono leggere e salvare dati, chat e file.
-- Solo l'admin (flowbase.service@gmail.com, email confermata) può cambiare gli stati.

create or replace function public.is_developer()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid() and lower(email) = 'flowbase.service@gmail.com' and email_confirmed_at is not null
  );
$$;

create table if not exists public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  email       text,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'blocked')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.profiles enable row level security;
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
-- Nessuna policy di modifica: gli stati si cambiano solo con admin_set_user_status().

create table if not exists public.app_settings (
  key   text primary key,
  value jsonb not null
);
alter table public.app_settings enable row level security;
insert into public.app_settings (key, value) values ('require_approval', 'true'::jsonb)
on conflict (key) do nothing;

-- Gli account che esistono già restano attivi.
insert into public.profiles (user_id, email, status, created_at, reviewed_at)
select id, email, 'approved', created_at, now() from auth.users
on conflict (user_id) do nothing;

-- Ogni nuovo account parte "in attesa" (o approvato, se l'approvazione è disattivata).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.profiles (user_id, email, status)
  values (
    new.id,
    new.email,
    case
      when lower(new.email) = 'flowbase.service@gmail.com' then 'approved'
      when coalesce((select value::text from public.app_settings where key = 'require_approval'), 'true') = 'false' then 'approved'
      else 'pending'
    end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select public.is_developer()
      or exists (select 1 from public.profiles where user_id = auth.uid() and status = 'approved');
$$;

-- Dati, chat e file: servono account proprio E approvato.
drop policy if exists "user_data_select_own" on public.user_data;
drop policy if exists "user_data_insert_own" on public.user_data;
drop policy if exists "user_data_update_own" on public.user_data;
drop policy if exists "user_data_delete_own" on public.user_data;
create policy "user_data_select_own" on public.user_data
  for select to authenticated using ((select auth.uid()) = user_id and (select public.is_approved()));
create policy "user_data_insert_own" on public.user_data
  for insert to authenticated with check ((select auth.uid()) = user_id and (select public.is_approved()));
create policy "user_data_update_own" on public.user_data
  for update to authenticated using ((select auth.uid()) = user_id and (select public.is_approved()))
  with check ((select auth.uid()) = user_id and (select public.is_approved()));
create policy "user_data_delete_own" on public.user_data
  for delete to authenticated using ((select auth.uid()) = user_id and (select public.is_approved()));

drop policy if exists "chats_select_own" on public.chats;
drop policy if exists "chats_insert_own" on public.chats;
drop policy if exists "chats_update_own" on public.chats;
drop policy if exists "chats_delete_own" on public.chats;
create policy "chats_select_own" on public.chats
  for select to authenticated using ((select auth.uid()) = user_id and (select public.is_approved()));
create policy "chats_insert_own" on public.chats
  for insert to authenticated with check ((select auth.uid()) = user_id and (select public.is_approved()));
create policy "chats_update_own" on public.chats
  for update to authenticated using ((select auth.uid()) = user_id and (select public.is_approved()))
  with check ((select auth.uid()) = user_id and (select public.is_approved()));
create policy "chats_delete_own" on public.chats
  for delete to authenticated using ((select auth.uid()) = user_id and (select public.is_approved()));

drop policy if exists "archive_select_own" on storage.objects;
drop policy if exists "archive_insert_own" on storage.objects;
drop policy if exists "archive_update_own" on storage.objects;
drop policy if exists "archive_delete_own" on storage.objects;
create policy "archive_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'archive' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_approved()));
create policy "archive_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'archive' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_approved()));
create policy "archive_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'archive' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_approved()))
  with check (bucket_id = 'archive' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_approved()));
create policy "archive_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'archive' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_approved()));

-- Funzioni del pannello Admin.
create or replace function public.admin_users()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_developer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'require_approval', coalesce((select value from public.app_settings where key = 'require_approval'), 'true'::jsonb),
    'users', coalesce((
      select jsonb_agg(u order by (u.status = 'pending') desc, u.created_at desc) from (
        select au.id as user_id, au.email, coalesce(p.status, 'pending') as status, au.created_at,
               au.email_confirmed_at is not null as email_confirmed, p.reviewed_at,
               (select max(created_at) from public.analytics_events e where e.user_id = au.id) as last_seen,
               (select coalesce(sum(seconds), 0) from public.analytics_events e where e.user_id = au.id and e.event = 'section_time') as seconds,
               lower(au.email) = 'flowbase.service@gmail.com' as is_admin
        from auth.users au left join public.profiles p on p.user_id = au.id
      ) u), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_set_user_status(p_user_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_developer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'approved', 'rejected', 'blocked') then
    raise exception 'invalid status';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'non puoi cambiare lo stato del tuo account';
  end if;
  insert into public.profiles (user_id, email, status, reviewed_at)
  select id, email, p_status, now() from auth.users where id = p_user_id
  on conflict (user_id) do update set status = excluded.status, reviewed_at = now();
end;
$$;

create or replace function public.admin_set_require_approval(p_value boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_developer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.app_settings (key, value) values ('require_approval', to_jsonb(p_value))
  on conflict (key) do update set value = excluded.value;
end;
$$;

revoke all on function public.admin_users() from public, anon;
revoke all on function public.admin_set_user_status(uuid, text) from public, anon;
revoke all on function public.admin_set_require_approval(boolean) from public, anon;
grant execute on function public.admin_users() to authenticated;
grant execute on function public.admin_set_user_status(uuid, text) to authenticated;
grant execute on function public.admin_set_require_approval(boolean) to authenticated;
grant execute on function public.is_approved() to authenticated;

notify pgrst, 'reload schema';
