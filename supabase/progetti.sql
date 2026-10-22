-- MYND Performance · Fase 1: progetti, attività (con sottoattività e fasi), note e link,
-- ultimi aggiornamenti. Le tabelle sono già pronte per i progetti condivisi (fase 2): chi vede
-- e modifica cosa lo decide il database, in base a chi è membro del progetto.
-- Si può rieseguire senza perdere dati.

create extension if not exists pgcrypto;

-- ───────────────────────── Tabelle ─────────────────────────

create table if not exists public.prj_projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null default 'personale' check (kind in ('personale', 'lavoro')),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (char_length(description) <= 4000),
  status      text not null default 'da_iniziare' check (status in ('da_iniziare', 'in_corso', 'completato')),
  due_date    date,
  phases      jsonb not null default '[]'::jsonb check (jsonb_typeof(phases) = 'array'),
  settings    jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists prj_projects_owner on public.prj_projects (owner_id);

-- Chi partecipa al progetto. Il proprietario viene aggiunto da solo quando il progetto nasce;
-- gli altri arriveranno con gli inviti (fase 2).
create table if not exists public.prj_members (
  project_id uuid not null references public.prj_projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'membro' check (role in ('proprietario', 'responsabile', 'membro', 'osservatore')),
  name       text check (char_length(name) <= 120),
  email      text check (char_length(email) <= 320),
  joined_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists prj_members_user on public.prj_members (user_id);

create table if not exists public.prj_tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.prj_projects (id) on delete cascade,
  parent_id   uuid references public.prj_tasks (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 300),
  description text check (char_length(description) <= 4000),
  status      text not null default 'da_fare' check (status in ('da_fare', 'in_corso', 'fatto')),
  due_date    date,
  assignee_id uuid references auth.users (id) on delete set null,
  phase       text check (char_length(phase) <= 80),
  position    double precision not null default 0,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  done_at     timestamptz
);
create index if not exists prj_tasks_project on public.prj_tasks (project_id);
create index if not exists prj_tasks_parent on public.prj_tasks (parent_id);

-- Note e link del progetto (i file di Google Drive arriveranno come link, fase 3).
create table if not exists public.prj_resources (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.prj_projects (id) on delete cascade,
  kind       text not null check (kind in ('nota', 'link', 'file')),
  title      text not null check (char_length(btrim(title)) between 1 and 200),
  body       text check (char_length(body) <= 20000),
  url        text check (url is null or (url ~* '^https?://' and char_length(url) <= 2000)),
  added_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prj_resources_project on public.prj_resources (project_id);

-- "Ultimi aggiornamenti": li scrivono solo i trigger qui sotto.
create table if not exists public.prj_updates (
  id         bigint generated always as identity primary key,
  project_id uuid not null references public.prj_projects (id) on delete cascade,
  actor_id   uuid references auth.users (id) on delete set null,
  text       text not null,
  at         timestamptz not null default now()
);
create index if not exists prj_updates_project on public.prj_updates (project_id, id desc);

-- ───────────────────────── Funzioni di controllo ─────────────────────────
-- "security definer": leggono prj_members senza passare dalle sue stesse regole (niente cicli).

create or replace function public.prj_my_role(p_project uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.prj_members where project_id = p_project and user_id = auth.uid() limit 1;
$$;

create or replace function public.prj_is_member(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.prj_my_role(p_project) is not null;
$$;

create or replace function public.prj_can_edit(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.prj_my_role(p_project) in ('proprietario', 'responsabile', 'membro'), false);
$$;

create or replace function public.prj_can_manage(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.prj_my_role(p_project) in ('proprietario', 'responsabile'), false);
$$;

-- ───────────────────────── Trigger ─────────────────────────

create or replace function public.prj_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Un nuovo progetto: limite per persona, e chi lo crea ne diventa il proprietario.
create or replace function public.prj_project_guard()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.prj_projects where owner_id = new.owner_id) >= 300 then
      raise exception 'Hai raggiunto il numero massimo di progetti (300): archivia o elimina quelli che non ti servono.' using errcode = 'P0001';
    end if;
  else
    new.owner_id := old.owner_id;         -- il proprietario non si cambia con una modifica
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

create or replace function public.prj_add_owner()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare v_email text;
begin
  select email into v_email from auth.users where id = new.owner_id;
  insert into public.prj_members (project_id, user_id, role, name, email)
  values (new.id, new.owner_id, 'proprietario', split_part(coalesce(v_email, ''), '@', 1), lower(v_email))
  on conflict (project_id, user_id) do update set role = 'proprietario';
  insert into public.prj_updates (project_id, actor_id, text) values (new.id, new.owner_id, 'ha creato il progetto');
  return new;
end $$;

-- Un'attività: limiti, sottoattività dello stesso progetto, responsabile tra i membri, data di completamento.
create or replace function public.prj_task_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.prj_tasks where project_id = new.project_id) >= 2000 then
    raise exception 'Questo progetto ha già troppe attività (2000).' using errcode = 'P0001';
  end if;
  if new.parent_id is not null then
    if new.parent_id = new.id or not exists (select 1 from public.prj_tasks where id = new.parent_id and project_id = new.project_id and parent_id is null) then
      raise exception 'La sottoattività deve stare sotto un''attività dello stesso progetto.' using errcode = 'P0001';
    end if;
  end if;
  if new.assignee_id is not null and not exists (select 1 from public.prj_members where project_id = new.project_id and user_id = new.assignee_id) then
    raise exception 'Il responsabile deve partecipare al progetto.' using errcode = 'P0001';
  end if;
  if new.status = 'fatto' and (tg_op = 'INSERT' or old.status <> 'fatto') then new.done_at := now();
  elsif new.status <> 'fatto' then new.done_at := null;
  end if;
  if tg_op = 'UPDATE' then new.created_by := old.created_by; new.created_at := old.created_at; end if;
  return new;
end $$;

create or replace function public.prj_resource_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.prj_resources where project_id = new.project_id) >= 500 then
    raise exception 'Questo progetto ha già troppe note e link (500).' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then new.added_by := old.added_by; new.created_at := old.created_at; new.project_id := old.project_id; end if;
  return new;
end $$;

-- Scrive una riga negli "Ultimi aggiornamenti" (tiene le 300 più recenti per progetto).
create or replace function public.prj_log(p_project uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.prj_updates (project_id, actor_id, text) values (p_project, auth.uid(), left(p_text, 400));
  delete from public.prj_updates where project_id = p_project and id < (
    select id from public.prj_updates where project_id = p_project order by id desc offset 300 limit 1);
end $$;
revoke all on function public.prj_log(uuid, text) from public, anon, authenticated;

create or replace function public.prj_task_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.prj_log(new.project_id, format('ha aggiunto “%s”', new.title));
  elsif new.status is distinct from old.status then
    perform public.prj_log(new.project_id, case new.status
      when 'fatto' then format('ha completato “%s”', new.title)
      when 'in_corso' then format('ha iniziato “%s”', new.title)
      else format('ha riaperto “%s”', new.title) end);
  elsif new.due_date is distinct from old.due_date then
    perform public.prj_log(new.project_id, case when new.due_date is null then format('ha tolto la scadenza a “%s”', new.title)
      else format('ha spostato “%s” al %s', new.title, to_char(new.due_date, 'DD/MM/YYYY')) end);
  end if;
  return null;
end $$;

create or replace function public.prj_resource_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.prj_log(new.project_id, format(case new.kind when 'nota' then 'ha aggiunto la nota “%s”' else 'ha aggiunto il link “%s”' end, new.title));
  return null;
end $$;

create or replace function public.prj_project_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    perform public.prj_log(new.id, case new.status when 'completato' then 'ha segnato il progetto come completato'
      when 'in_corso' then 'ha messo il progetto in corso' else 'ha rimesso il progetto da iniziare' end);
  end if;
  if new.archived_at is distinct from old.archived_at then
    perform public.prj_log(new.id, case when new.archived_at is null then 'ha ripristinato il progetto' else 'ha archiviato il progetto' end);
  end if;
  return null;
end $$;

drop trigger if exists prj_projects_guard on public.prj_projects;
create trigger prj_projects_guard before insert or update on public.prj_projects for each row execute function public.prj_project_guard();
drop trigger if exists prj_projects_owner on public.prj_projects;
create trigger prj_projects_owner after insert on public.prj_projects for each row execute function public.prj_add_owner();
drop trigger if exists prj_projects_log on public.prj_projects;
create trigger prj_projects_log after update on public.prj_projects for each row execute function public.prj_project_log();
drop trigger if exists prj_tasks_guard on public.prj_tasks;
create trigger prj_tasks_guard before insert or update on public.prj_tasks for each row execute function public.prj_task_guard();
drop trigger if exists prj_tasks_log on public.prj_tasks;
create trigger prj_tasks_log after insert or update on public.prj_tasks for each row execute function public.prj_task_log();
drop trigger if exists prj_resources_guard on public.prj_resources;
create trigger prj_resources_guard before insert or update on public.prj_resources for each row execute function public.prj_resource_guard();
drop trigger if exists prj_resources_log on public.prj_resources;
create trigger prj_resources_log after insert on public.prj_resources for each row execute function public.prj_resource_log();
do $$
declare t text;
begin
  foreach t in array array['prj_projects', 'prj_tasks', 'prj_resources'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.prj_touch()', t || '_touch', t);
  end loop;
end $$;

-- ───────────────────────── Regole di accesso (Row Level Security) ─────────────────────────

alter table public.prj_projects enable row level security;
alter table public.prj_members enable row level security;
alter table public.prj_tasks enable row level security;
alter table public.prj_resources enable row level security;
alter table public.prj_updates enable row level security;

drop policy if exists prj_projects_select on public.prj_projects;
drop policy if exists prj_projects_insert on public.prj_projects;
drop policy if exists prj_projects_update on public.prj_projects;
drop policy if exists prj_projects_delete on public.prj_projects;
create policy prj_projects_select on public.prj_projects for select to authenticated
  using (owner_id = auth.uid() or public.prj_is_member(id));
create policy prj_projects_insert on public.prj_projects for insert to authenticated
  with check (owner_id = auth.uid());
-- Nei progetti personali tutti i membri possono modificare; in quelli di lavoro solo proprietario e responsabili.
create policy prj_projects_update on public.prj_projects for update to authenticated
  using (public.prj_can_manage(id) or (kind = 'personale' and public.prj_can_edit(id)))
  with check (public.prj_can_manage(id) or (kind = 'personale' and public.prj_can_edit(id)));
create policy prj_projects_delete on public.prj_projects for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists prj_members_select on public.prj_members;
create policy prj_members_select on public.prj_members for select to authenticated
  using (public.prj_is_member(project_id));

drop policy if exists prj_tasks_select on public.prj_tasks;
drop policy if exists prj_tasks_insert on public.prj_tasks;
drop policy if exists prj_tasks_update on public.prj_tasks;
drop policy if exists prj_tasks_delete on public.prj_tasks;
create policy prj_tasks_select on public.prj_tasks for select to authenticated using (public.prj_is_member(project_id));
create policy prj_tasks_insert on public.prj_tasks for insert to authenticated
  with check (public.prj_can_edit(project_id) and created_by = auth.uid());
create policy prj_tasks_update on public.prj_tasks for update to authenticated
  using (public.prj_can_edit(project_id)) with check (public.prj_can_edit(project_id));
create policy prj_tasks_delete on public.prj_tasks for delete to authenticated using (public.prj_can_edit(project_id));

drop policy if exists prj_resources_select on public.prj_resources;
drop policy if exists prj_resources_insert on public.prj_resources;
drop policy if exists prj_resources_update on public.prj_resources;
drop policy if exists prj_resources_delete on public.prj_resources;
create policy prj_resources_select on public.prj_resources for select to authenticated using (public.prj_is_member(project_id));
create policy prj_resources_insert on public.prj_resources for insert to authenticated
  with check (public.prj_can_edit(project_id) and added_by = auth.uid());
-- Ognuno modifica le sue note; proprietario e responsabili tutte.
create policy prj_resources_update on public.prj_resources for update to authenticated
  using (added_by = auth.uid() or public.prj_can_manage(project_id)) with check (public.prj_can_edit(project_id));
create policy prj_resources_delete on public.prj_resources for delete to authenticated
  using (added_by = auth.uid() or public.prj_can_manage(project_id));

drop policy if exists prj_updates_select on public.prj_updates;
create policy prj_updates_select on public.prj_updates for select to authenticated using (public.prj_is_member(project_id));

grant select, insert, update, delete on public.prj_projects, public.prj_tasks, public.prj_resources to authenticated;
grant select on public.prj_members, public.prj_updates to authenticated;
revoke all on public.prj_projects, public.prj_members, public.prj_tasks, public.prj_resources, public.prj_updates from anon;
