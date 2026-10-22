-- MYND Performance · Fase 2: progetti condivisi.
-- Inviti per email (arrivano nel menu dell'account), ruoli, uscita e rimozione dal progetto.
-- Richiede progetti.sql (fase 1). Si può rieseguire senza perdere dati.

-- ───────────────────────── Inviti ─────────────────────────
-- invited_user è vuoto quando l'email non ha ancora un account MYND: l'invito la aspetta e
-- compare appena la persona si registra con quella email.
create table if not exists public.prj_invites (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.prj_projects (id) on delete cascade,
  invited_email text not null check (char_length(invited_email) between 3 and 320),
  invited_user  uuid references auth.users (id) on delete cascade,
  invited_by    uuid references auth.users (id) on delete set null,
  role          text not null default 'membro' check (role in ('responsabile', 'membro', 'osservatore')),
  status        text not null default 'in_attesa' check (status in ('in_attesa', 'accettato', 'rifiutato', 'annullato')),
  created_at    timestamptz not null default now(),
  answered_at   timestamptz
);
create unique index if not exists prj_invites_pending on public.prj_invites (project_id, lower(invited_email)) where status = 'in_attesa';
create index if not exists prj_invites_user on public.prj_invites (invited_user) where status = 'in_attesa';
create index if not exists prj_invites_email on public.prj_invites (lower(invited_email)) where status = 'in_attesa';
create index if not exists prj_invites_by on public.prj_invites (invited_by, created_at);

alter table public.prj_invites enable row level security;
drop policy if exists prj_invites_select on public.prj_invites;
create policy prj_invites_select on public.prj_invites for select to authenticated
  using (public.prj_is_member(project_id) or invited_user = auth.uid());
grant select on public.prj_invites to authenticated;
revoke all on public.prj_invites from anon;

-- Chi può invitare: nei progetti personali chi partecipa e può modificare; in quelli di lavoro proprietario e responsabili.
create or replace function public.prj_can_invite(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.prj_can_manage(p_project)
      or (public.prj_can_edit(p_project) and exists (select 1 from public.prj_projects where id = p_project and kind = 'personale'));
$$;

-- Invita per email. Risponde: invited (account trovato), waiting (nessun account: l'invito aspetta),
-- already_member, already_invited, self.
create or replace function public.prj_invite(p_project uuid, p_email text, p_role text default 'membro')
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user  uuid;
  v_name  text;
begin
  if auth.uid() is null then raise exception 'Accedi per invitare.' using errcode = 'P0001'; end if;
  if not public.prj_can_invite(p_project) then raise exception 'Non puoi invitare persone in questo progetto.' using errcode = 'P0001'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Scrivi un indirizzo email valido.' using errcode = 'P0001'; end if;
  if p_role not in ('responsabile', 'membro', 'osservatore') then raise exception 'Ruolo non valido.' using errcode = 'P0001'; end if;
  if (select count(*) from public.prj_invites where invited_by = auth.uid() and created_at > now() - interval '1 day') >= 40 then
    raise exception 'Hai inviato molti inviti oggi: riprova domani.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.prj_members where project_id = p_project) >= 50 then
    raise exception 'Questo progetto ha già il numero massimo di persone (50).' using errcode = 'P0001';
  end if;

  select id into v_user from auth.users where lower(email) = v_email limit 1;
  if v_user = auth.uid() then return jsonb_build_object('status', 'self'); end if;
  if v_user is not null and exists (select 1 from public.prj_members where project_id = p_project and user_id = v_user) then
    return jsonb_build_object('status', 'already_member');
  end if;
  if exists (select 1 from public.prj_invites where project_id = p_project and lower(invited_email) = v_email and status = 'in_attesa') then
    return jsonb_build_object('status', 'already_invited');
  end if;

  insert into public.prj_invites (project_id, invited_email, invited_user, invited_by, role)
  values (p_project, v_email, v_user, auth.uid(), p_role);
  v_name := split_part(v_email, '@', 1);
  perform public.prj_log(p_project, format('ha invitato %s', v_email));
  return jsonb_build_object('status', case when v_user is null then 'waiting' else 'invited' end, 'name', v_name);
end $$;

-- Gli inviti in attesa per chi è collegato (anche quelli fatti alla sua email prima che si registrasse).
create or replace function public.prj_my_invites()
returns table (id uuid, project_id uuid, project_name text, project_kind text, role text, invited_by_email text, created_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select i.id, i.project_id, p.name, p.kind, i.role, u.email, i.created_at
  from public.prj_invites i
  join public.prj_projects p on p.id = i.project_id
  left join auth.users u on u.id = i.invited_by
  where i.status = 'in_attesa'
    and (i.invited_user = auth.uid()
         or (i.invited_user is null and lower(i.invited_email) = (select lower(email) from auth.users where id = auth.uid())))
  order by i.created_at desc
  limit 50;
$$;

-- Accetta o rifiuta un invito ricevuto.
create or replace function public.prj_answer_invite(p_invite uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_inv   public.prj_invites%rowtype;
  v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();
  select * into v_inv from public.prj_invites where id = p_invite and status = 'in_attesa' for update;
  if not found or not (v_inv.invited_user = auth.uid() or (v_inv.invited_user is null and lower(v_inv.invited_email) = lower(v_email))) then
    raise exception 'Questo invito non è più valido.' using errcode = 'P0001';
  end if;
  update public.prj_invites set status = case when p_accept then 'accettato' else 'rifiutato' end,
    invited_user = auth.uid(), answered_at = now() where id = p_invite;
  if p_accept then
    insert into public.prj_members (project_id, user_id, role, name, email)
    values (v_inv.project_id, auth.uid(), v_inv.role, split_part(coalesce(v_email, ''), '@', 1), lower(v_email))
    on conflict (project_id, user_id) do nothing;
    perform public.prj_log(v_inv.project_id, 'si è unito al progetto');
  end if;
  return v_inv.project_id;
end $$;

-- Annulla un invito non ancora accettato.
create or replace function public.prj_cancel_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid;
begin
  select project_id into v_project from public.prj_invites where id = p_invite and status = 'in_attesa';
  if v_project is null then return; end if;
  if not (public.prj_can_invite(v_project) or exists (select 1 from public.prj_invites where id = p_invite and invited_by = auth.uid())) then
    raise exception 'Non puoi annullare questo invito.' using errcode = 'P0001';
  end if;
  update public.prj_invites set status = 'annullato', answered_at = now() where id = p_invite;
end $$;

-- Cambia il ruolo di una persona (solo il proprietario; il proprietario resta tale).
create or replace function public.prj_set_member_role(p_project uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.prj_my_role(p_project) is distinct from 'proprietario' then raise exception 'Solo il proprietario può cambiare i ruoli.' using errcode = 'P0001'; end if;
  if p_role not in ('responsabile', 'membro', 'osservatore') then raise exception 'Ruolo non valido.' using errcode = 'P0001'; end if;
  update public.prj_members set role = p_role where project_id = p_project and user_id = p_user and role <> 'proprietario';
end $$;

-- Toglie una persona dal progetto, o fa uscire chi lo chiede. Le sue attività restano, senza responsabile.
create or replace function public.prj_remove_member(p_project uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_role text; v_email text;
begin
  select role, email into v_role, v_email from public.prj_members where project_id = p_project and user_id = p_user;
  if v_role is null then return; end if;
  if v_role = 'proprietario' then raise exception 'Il proprietario non può uscire dal suo progetto: può eliminarlo.' using errcode = 'P0001'; end if;
  if p_user <> auth.uid() and not public.prj_can_manage(p_project) then raise exception 'Non puoi togliere persone da questo progetto.' using errcode = 'P0001'; end if;
  update public.prj_tasks set assignee_id = null where project_id = p_project and assignee_id = p_user;
  delete from public.prj_members where project_id = p_project and user_id = p_user;
  perform public.prj_log(p_project, case when p_user = auth.uid() then 'è uscito dal progetto' else format('ha tolto %s dal progetto', coalesce(v_email, 'una persona')) end);
end $$;

revoke all on function public.prj_invite(uuid, text, text) from public, anon;
revoke all on function public.prj_my_invites() from public, anon;
revoke all on function public.prj_answer_invite(uuid, boolean) from public, anon;
revoke all on function public.prj_cancel_invite(uuid) from public, anon;
revoke all on function public.prj_set_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.prj_remove_member(uuid, uuid) from public, anon;
grant execute on function public.prj_invite(uuid, text, text) to authenticated;
grant execute on function public.prj_my_invites() to authenticated;
grant execute on function public.prj_answer_invite(uuid, boolean) to authenticated;
grant execute on function public.prj_cancel_invite(uuid) to authenticated;
grant execute on function public.prj_set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.prj_remove_member(uuid, uuid) to authenticated;
