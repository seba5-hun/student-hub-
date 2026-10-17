-- MYND: "Suggerisci una modifica".
-- Gli utenti scrivono un suggerimento dall'app; solo l'admin (flowbase.service@gmail.com) li legge
-- nel pannello Admin → Suggerimenti.
-- Da incollare una volta in Supabase → SQL Editor → New query → Run (dopo schema.sql).

create table if not exists public.suggestions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null default auth.uid(),
  kind        text not null default 'idea' check (kind in ('idea', 'problema', 'altro')),
  section     text check (char_length(section) <= 40),
  message     text not null check (char_length(message) between 3 and 2000),
  status      text not null default 'new' check (status in ('new', 'read', 'done')),
  created_at  timestamptz not null default now()
);

alter table public.suggestions enable row level security;

-- Ognuno può inviare suggerimenti a proprio nome (al massimo 20 al giorno) e rileggere i propri.
drop policy if exists "suggestions_insert_own" on public.suggestions;
create policy "suggestions_insert_own" on public.suggestions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'new'
    and (select count(*) from public.suggestions s
         where s.user_id = (select auth.uid()) and s.created_at > now() - interval '1 day') < 20
  );

drop policy if exists "suggestions_select_own" on public.suggestions;
create policy "suggestions_select_own" on public.suggestions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Nessuna policy di modifica o eliminazione: lo fa solo l'admin con le funzioni qui sotto.

create or replace function public.admin_suggestions()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_developer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by (x.status = 'new') desc, x.created_at desc) from (
      select s.id, s.kind, s.section, s.message, s.status, s.created_at, au.email
      from public.suggestions s left join auth.users au on au.id = s.user_id
    ) x), '[]'::jsonb);
end;
$$;

create or replace function public.admin_set_suggestion_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_developer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status not in ('new', 'read', 'done') then
    raise exception 'invalid status';
  end if;
  update public.suggestions set status = p_status where id = p_id;
end;
$$;

create or replace function public.admin_delete_suggestion(p_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_developer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.suggestions where id = p_id;
end;
$$;

revoke all on function public.admin_suggestions() from public, anon;
revoke all on function public.admin_set_suggestion_status(uuid, text) from public, anon;
revoke all on function public.admin_delete_suggestion(uuid) from public, anon;
grant execute on function public.admin_suggestions() to authenticated;
grant execute on function public.admin_set_suggestion_status(uuid, text) to authenticated;
grant execute on function public.admin_delete_suggestion(uuid) to authenticated;

notify pgrst, 'reload schema';
