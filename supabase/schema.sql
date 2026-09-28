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
