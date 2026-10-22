-- MYND Performance · Strumenti su misura per ogni progetto.
-- Uno strumento è una raccolta con i suoi campi (testo, soldi, date, persone, scelte…), una vista e
-- dei calcoli (totali, per persona, chi deve quanto a chi). MYND AI li compone in base al progetto:
-- spese di una vacanza, ore di un freelance, chilometri in bici, clienti, ricette… qualsiasi cosa.
-- Richiede progetti.sql. Si può rieseguire senza perdere dati.

create table if not exists public.prj_tools (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.prj_projects (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  icon        text check (char_length(icon) <= 30),
  description text check (char_length(description) <= 500),
  config      jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 16000),
  position    double precision not null default 0,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists prj_tools_project on public.prj_tools (project_id);

create table if not exists public.prj_tool_items (
  id         uuid primary key default gen_random_uuid(),
  tool_id    uuid not null references public.prj_tools (id) on delete cascade,
  project_id uuid not null references public.prj_projects (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 12000),
  position   double precision not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prj_tool_items_tool on public.prj_tool_items (tool_id);
create index if not exists prj_tool_items_project on public.prj_tool_items (project_id);

-- Chi può cambiare la struttura del progetto (strumenti compresi): come per i dati del progetto.
create or replace function public.prj_can_edit_project(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.prj_can_manage(p_project)
      or (public.prj_can_edit(p_project) and exists (select 1 from public.prj_projects where id = p_project and kind = 'personale'));
$$;

create or replace function public.prj_tool_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.prj_tools where project_id = new.project_id) >= 30 then
      raise exception 'Questo progetto ha già il numero massimo di strumenti (30).' using errcode = 'P0001';
    end if;
    perform public.prj_log(new.project_id, format('ha aggiunto lo strumento “%s”', new.name));
  else
    new.project_id := old.project_id; new.created_by := old.created_by; new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.prj_tool_item_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.tool_id := old.tool_id; new.created_by := old.created_by; new.created_at := old.created_at;
  elsif (select count(*) from public.prj_tool_items where tool_id = new.tool_id) >= 5000 then
    raise exception 'Questo strumento ha già troppe voci (5000).' using errcode = 'P0001';
  end if;
  -- La voce sta sempre nel progetto del suo strumento.
  select project_id into new.project_id from public.prj_tools where id = new.tool_id;
  if new.project_id is null then raise exception 'Strumento non trovato.' using errcode = 'P0001'; end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists prj_tools_guard on public.prj_tools;
create trigger prj_tools_guard before insert or update on public.prj_tools for each row execute function public.prj_tool_guard();
drop trigger if exists prj_tool_items_guard on public.prj_tool_items;
create trigger prj_tool_items_guard before insert or update on public.prj_tool_items for each row execute function public.prj_tool_item_guard();

alter table public.prj_tools enable row level security;
alter table public.prj_tool_items enable row level security;

drop policy if exists prj_tools_select on public.prj_tools;
drop policy if exists prj_tools_insert on public.prj_tools;
drop policy if exists prj_tools_update on public.prj_tools;
drop policy if exists prj_tools_delete on public.prj_tools;
create policy prj_tools_select on public.prj_tools for select to authenticated using (public.prj_is_member(project_id));
create policy prj_tools_insert on public.prj_tools for insert to authenticated with check (public.prj_can_edit_project(project_id));
create policy prj_tools_update on public.prj_tools for update to authenticated
  using (public.prj_can_edit_project(project_id)) with check (public.prj_can_edit_project(project_id));
create policy prj_tools_delete on public.prj_tools for delete to authenticated using (public.prj_can_edit_project(project_id));

drop policy if exists prj_tool_items_select on public.prj_tool_items;
drop policy if exists prj_tool_items_insert on public.prj_tool_items;
drop policy if exists prj_tool_items_update on public.prj_tool_items;
drop policy if exists prj_tool_items_delete on public.prj_tool_items;
create policy prj_tool_items_select on public.prj_tool_items for select to authenticated using (public.prj_is_member(project_id));
create policy prj_tool_items_insert on public.prj_tool_items for insert to authenticated
  with check (public.prj_can_edit((select t.project_id from public.prj_tools t where t.id = tool_id)));
create policy prj_tool_items_update on public.prj_tool_items for update to authenticated
  using (public.prj_can_edit(project_id)) with check (public.prj_can_edit(project_id));
create policy prj_tool_items_delete on public.prj_tool_items for delete to authenticated using (public.prj_can_edit(project_id));

grant select, insert, update, delete on public.prj_tools, public.prj_tool_items to authenticated;
revoke all on public.prj_tools, public.prj_tool_items from anon;
