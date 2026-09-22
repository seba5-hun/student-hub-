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
