-- MYND Business: aziende, team, ruoli, clienti, contratti, progetti, compiti, registro attività.
-- Si può eseguire più volte (SQL Editor di Supabase → incolla → Run): non cancella dati.
-- Richiede le funzioni public.is_developer() di schema.sql.
--
-- Sicurezza: ogni tabella ha la Row Level Security attiva. Una persona vede solo le aziende di cui
-- fa parte e, dentro l'azienda, solo ciò che il suo ruolo (e il capo progetto) le permette.
-- Per ora solo l'account admin può creare un'azienda.

-- ───────────────────────── Tabelle ─────────────────────────

create table if not exists public.biz_orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 120),
  sector      text,
  vat         text,
  settings    jsonb not null default '{}'::jsonb,   -- es. {"hidden_sections": ["insights"]}
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Le persone del team. user_id è vuoto finché la persona non ha un account MYND collegato.
create table if not exists public.biz_people (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.biz_orgs (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null,
  name         text not null check (length(trim(name)) between 1 and 120),
  email        text,
  role         text not null default 'dipendente'
               check (role in ('titolare', 'admin', 'manager', 'dipendente', 'finanza', 'esterno')),
  job_title    text,
  department   text,
  skills       jsonb not null default '[]'::jsonb,  -- [{"name": "Video", "level": 4}]
  availability jsonb not null default '{}'::jsonb,  -- {"hours_week": 40, "days": [1,2,3,4,5]}
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, id)
);
create unique index if not exists biz_people_org_user on public.biz_people (org_id, user_id) where user_id is not null;
create unique index if not exists biz_people_org_email on public.biz_people (org_id, lower(email)) where email is not null;

-- Clienti, fornitori e partner (es. sponsor).
create table if not exists public.biz_counterparties (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.biz_orgs (id) on delete cascade,
  kind                text not null default 'cliente' check (kind in ('cliente', 'fornitore', 'partner')),
  name                text not null check (length(trim(name)) between 1 and 160),
  legal_name          text,
  vat                 text,
  tax_code            text,
  address             text,
  pec                 text,
  sdi_code            text,
  website             text,
  sector              text,
  importance          text not null default 'B' check (importance in ('A', 'B', 'C')),
  payment_terms_days  integer check (payment_terms_days between 0 and 365),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (org_id, id)
);

create table if not exists public.biz_contacts (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.biz_orgs (id) on delete cascade,
  counterparty_id  uuid not null,
  name             text not null,
  role             text,
  email            text,
  phone            text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (org_id, counterparty_id) references public.biz_counterparties (org_id, id) on delete cascade
);

create table if not exists public.biz_contracts (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.biz_orgs (id) on delete cascade,
  counterparty_id  uuid not null,
  title            text not null,
  start_date       date,
  end_date         date,
  auto_renew       boolean not null default false,
  notice_days      integer check (notice_days between 0 and 730),
  value            numeric(14, 2),
  currency         text not null default 'EUR',
  status           text not null default 'attivo' check (status in ('bozza', 'attivo', 'scaduto', 'disdetto')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, counterparty_id) references public.biz_counterparties (org_id, id) on delete cascade
);

-- Obblighi e diritti di un contratto: chi deve cosa, quando e ogni quanto.
create table if not exists public.biz_contract_terms (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.biz_orgs (id) on delete cascade,
  contract_id      uuid not null,
  party            text not null check (party in ('noi', 'controparte')),
  kind             text not null check (kind in ('obbligo', 'diritto')),
  description      text not null,
  every_n          integer check (every_n between 1 and 366),
  every_unit       text check (every_unit in ('giorni', 'settimane', 'mesi', 'anni')),
  due_date         date,
  quota            integer check (quota >= 0),          -- es. 2 revisioni gratuite
  used             integer not null default 0 check (used >= 0),
  owner_person_id  uuid,
  source_excerpt   text,                                -- il punto del contratto da cui viene
  confirmed        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (org_id, contract_id) references public.biz_contracts (org_id, id) on delete cascade,
  foreign key (org_id, owner_person_id) references public.biz_people (org_id, id)
);

create table if not exists public.biz_projects (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.biz_orgs (id) on delete cascade,
  name             text not null check (length(trim(name)) between 1 and 160),
  objective        text,
  counterparty_id  uuid,
  owner_person_id  uuid,                                -- il capo progetto
  start_date       date,
  deadline         date,
  budget           numeric(14, 2),
  status           text not null default 'attivo' check (status in ('attivo', 'in_pausa', 'completato', 'annullato')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, counterparty_id) references public.biz_counterparties (org_id, id),
  foreign key (org_id, owner_person_id) references public.biz_people (org_id, id)
);

-- Chi fa parte di un progetto e cosa ne vede (lo decide il capo progetto).
create table if not exists public.biz_project_members (
  org_id        uuid not null references public.biz_orgs (id) on delete cascade,
  project_id    uuid not null,
  person_id     uuid not null,
  project_role  text,
  sees          jsonb not null default '{"tasks": true, "documents": true, "client": true, "finance": false}'::jsonb,
  created_at    timestamptz not null default now(),
  primary key (project_id, person_id),
  foreign key (org_id, project_id) references public.biz_projects (org_id, id) on delete cascade,
  foreign key (org_id, person_id) references public.biz_people (org_id, id) on delete cascade
);

create table if not exists public.biz_tasks (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.biz_orgs (id) on delete cascade,
  project_id          uuid,
  title               text not null check (length(trim(title)) between 1 and 200),
  notes               text,
  assignee_person_id  uuid,
  due_date            date,
  estimate_minutes    integer check (estimate_minutes between 0 and 10000),
  importance          integer not null default 3 check (importance between 1 and 5),
  status              text not null default 'da_fare' check (status in ('da_fare', 'in_corso', 'fatto')),
  depends_on          uuid[] not null default '{}',
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (org_id, project_id) references public.biz_projects (org_id, id) on delete cascade,
  foreign key (org_id, assignee_person_id) references public.biz_people (org_id, id)
);

-- Registro attività: si scrive solo dai trigger, non si modifica e non si cancella.
create table if not exists public.biz_audit_log (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.biz_orgs (id) on delete cascade,
  at          timestamptz not null default now(),
  actor_user  uuid,
  actor_kind  text not null default 'persona' check (actor_kind in ('persona', 'ai', 'automazione', 'sistema')),
  table_name  text not null,
  row_id      text,
  action      text not null check (action in ('crea', 'modifica', 'elimina')),
  before      jsonb,
  after       jsonb
);
create index if not exists biz_audit_org_at on public.biz_audit_log (org_id, at desc);

create index if not exists biz_people_org on public.biz_people (org_id);
create index if not exists biz_counterparties_org on public.biz_counterparties (org_id);
create index if not exists biz_contacts_cp on public.biz_contacts (counterparty_id);
create index if not exists biz_contracts_cp on public.biz_contracts (counterparty_id);
create index if not exists biz_terms_contract on public.biz_contract_terms (contract_id);
create index if not exists biz_projects_org on public.biz_projects (org_id);
create index if not exists biz_members_person on public.biz_project_members (person_id);
create index if not exists biz_tasks_org on public.biz_tasks (org_id);
create index if not exists biz_tasks_project on public.biz_tasks (project_id);
create index if not exists biz_tasks_assignee on public.biz_tasks (assignee_person_id);

-- ───────────────────────── Funzioni di controllo ─────────────────────────
-- "security definer": leggono biz_people senza passare dalle sue stesse regole (niente cicli).

create or replace function public.biz_my_role(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.biz_people
  where org_id = p_org and user_id = auth.uid() and active
  limit 1;
$$;

create or replace function public.biz_my_person(p_org uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.biz_people
  where org_id = p_org and user_id = auth.uid() and active
  limit 1;
$$;

create or replace function public.biz_has_role(p_org uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.biz_my_role(p_org) = any (p_roles), false);
$$;

create or replace function public.biz_is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.biz_my_role(p_org) is not null;
$$;

-- Vede il progetto: titolare e admin sempre, il capo progetto, i membri del progetto.
create or replace function public.biz_can_see_project(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.biz_projects p
    where p.id = p_project
      and (
        public.biz_has_role(p.org_id, array['titolare', 'admin'])
        or p.owner_person_id = public.biz_my_person(p.org_id)
        or exists (select 1 from public.biz_project_members m
                   where m.project_id = p.id and m.person_id = public.biz_my_person(p.org_id))
      )
  );
$$;

-- È tra i membri del progetto (usata dalle regole: legge solo la tabella dei membri).
create or replace function public.biz_in_project(p_project uuid, p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.biz_project_members
                 where project_id = p_project and person_id = public.biz_my_person(p_org));
$$;

-- Gestisce il progetto: titolare, admin e il capo progetto.
create or replace function public.biz_can_manage_project(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.biz_projects p
    where p.id = p_project
      and (public.biz_has_role(p.org_id, array['titolare', 'admin'])
           or p.owner_person_id = public.biz_my_person(p.org_id))
  );
$$;

-- Crea un'azienda e il suo titolare (per ora solo l'account admin).
create or replace function public.biz_create_org(p_name text, p_sector text default null, p_owner_name text default null)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_org uuid;
  v_email text;
begin
  if not public.is_developer() then
    raise exception 'MYND Business non è ancora disponibile per questo account' using errcode = '42501';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.biz_orgs (name, sector, created_by) values (trim(p_name), nullif(trim(p_sector), ''), auth.uid())
  returning id into v_org;
  insert into public.biz_people (org_id, user_id, name, email, role)
  values (v_org, auth.uid(), coalesce(nullif(trim(p_owner_name), ''), split_part(v_email, '@', 1)), lower(v_email), 'titolare');
  return v_org;
end;
$$;
revoke all on function public.biz_create_org(text, text, text) from public, anon;
grant execute on function public.biz_create_org(text, text, text) to authenticated;

-- ───────────────────────── Trigger ─────────────────────────

create or replace function public.biz_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Il team non può restare senza titolare, e solo un titolare può nominarne un altro.
create or replace function public.biz_people_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.role = 'titolare'
     and (tg_op = 'INSERT' or old.role is distinct from 'titolare')
     and coalesce(public.biz_my_role(new.org_id), '') <> 'titolare'
     and exists (select 1 from public.biz_people where org_id = new.org_id and role = 'titolare' and active) then
    raise exception 'Solo un titolare può nominare un altro titolare' using errcode = '42501';
  end if;
  -- Se si sta eliminando l'intera azienda, le persone se ne vanno con lei.
  if tg_op = 'DELETE' and not exists (select 1 from public.biz_orgs where id = old.org_id) then
    return old;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.role = 'titolare' and old.active
     and (tg_op = 'DELETE' or new.role <> 'titolare' or not new.active)
     and not exists (select 1 from public.biz_people
                     where org_id = old.org_id and id <> old.id and role = 'titolare' and active) then
    raise exception 'L''azienda deve avere almeno un titolare' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.biz_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_kind text := coalesce(nullif(current_setting('mynd.actor_kind', true), ''), 'persona');
begin
  -- Quando si elimina un'azienda, le sue righe spariscono insieme al registro: niente da scrivere.
  if tg_op = 'DELETE' and tg_table_name <> 'biz_orgs'
     and not exists (select 1 from public.biz_orgs where id = (v_row ->> 'org_id')::uuid) then
    return old;
  end if;
  if tg_table_name = 'biz_orgs' and tg_op = 'DELETE' then
    return old;
  end if;
  insert into public.biz_audit_log (org_id, actor_user, actor_kind, table_name, row_id, action, before, after)
  values (
    case when tg_table_name = 'biz_orgs' then (v_row ->> 'id')::uuid else (v_row ->> 'org_id')::uuid end,
    auth.uid(),
    case when v_kind in ('persona', 'ai', 'automazione', 'sistema') then v_kind else 'persona' end,
    tg_table_name,
    coalesce(v_row ->> 'id', concat_ws(':', v_row ->> 'project_id', v_row ->> 'person_id')),
    case tg_op when 'INSERT' then 'crea' when 'UPDATE' then 'modifica' else 'elimina' end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['biz_orgs', 'biz_people', 'biz_counterparties', 'biz_contacts', 'biz_contracts',
                           'biz_contract_terms', 'biz_projects', 'biz_tasks'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.biz_touch()', t || '_touch', t);
  end loop;
  foreach t in array array['biz_orgs', 'biz_people', 'biz_counterparties', 'biz_contacts', 'biz_contracts',
                           'biz_contract_terms', 'biz_projects', 'biz_project_members', 'biz_tasks'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.biz_audit()', t || '_audit', t);
  end loop;
end $$;

drop trigger if exists biz_people_guard on public.biz_people;
create trigger biz_people_guard before insert or update or delete on public.biz_people
  for each row execute function public.biz_people_guard();

-- ───────────────────────── Regole di accesso (RLS) ─────────────────────────

alter table public.biz_orgs            enable row level security;
alter table public.biz_people          enable row level security;
alter table public.biz_counterparties  enable row level security;
alter table public.biz_contacts        enable row level security;
alter table public.biz_contracts       enable row level security;
alter table public.biz_contract_terms  enable row level security;
alter table public.biz_projects        enable row level security;
alter table public.biz_project_members enable row level security;
alter table public.biz_tasks           enable row level security;
alter table public.biz_audit_log       enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and tablename like 'biz\_%' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Aziende: le vede chi ne fa parte; si creano solo con biz_create_org().
create policy biz_orgs_select on public.biz_orgs for select to authenticated using (public.biz_is_member(id));
create policy biz_orgs_update on public.biz_orgs for update to authenticated
  using (public.biz_has_role(id, array['titolare', 'admin'])) with check (public.biz_has_role(id, array['titolare', 'admin']));
create policy biz_orgs_delete on public.biz_orgs for delete to authenticated using (public.biz_has_role(id, array['titolare']));

-- Team: tutti i membri vedono i colleghi; titolare e admin li gestiscono.
create policy biz_people_select on public.biz_people for select to authenticated using (public.biz_is_member(org_id));
create policy biz_people_insert on public.biz_people for insert to authenticated
  with check (public.biz_has_role(org_id, array['titolare', 'admin']));
create policy biz_people_update on public.biz_people for update to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin'])) with check (public.biz_has_role(org_id, array['titolare', 'admin']));
create policy biz_people_delete on public.biz_people for delete to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin']));

-- Clienti e referenti: li vede tutto il team interno (non i collaboratori esterni).
create policy biz_cp_select on public.biz_counterparties for select to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin', 'manager', 'dipendente', 'finanza']));
create policy biz_cp_write on public.biz_counterparties for all to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin', 'manager']))
  with check (public.biz_has_role(org_id, array['titolare', 'admin', 'manager']));
create policy biz_contacts_select on public.biz_contacts for select to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin', 'manager', 'dipendente', 'finanza']));
create policy biz_contacts_write on public.biz_contacts for all to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin', 'manager']))
  with check (public.biz_has_role(org_id, array['titolare', 'admin', 'manager']));

-- Contratti, obblighi e diritti: titolare, admin, manager e finanza.
create policy biz_contracts_select on public.biz_contracts for select to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin', 'manager', 'finanza']));
create policy biz_contracts_write on public.biz_contracts for all to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin', 'manager']))
  with check (public.biz_has_role(org_id, array['titolare', 'admin', 'manager']));
create policy biz_terms_select on public.biz_contract_terms for select to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin', 'manager', 'finanza']));
create policy biz_terms_write on public.biz_contract_terms for all to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin', 'manager']))
  with check (public.biz_has_role(org_id, array['titolare', 'admin', 'manager']));

-- Progetti: titolare e admin tutti; gli altri quelli che guidano o a cui partecipano.
-- Le regole usano le colonne della riga (non una nuova ricerca del progetto), così valgono anche
-- per un progetto appena creato.
create policy biz_projects_select on public.biz_projects for select to authenticated using (
  public.biz_has_role(org_id, array['titolare', 'admin'])
  or owner_person_id = public.biz_my_person(org_id)
  or public.biz_in_project(id, org_id)
);
create policy biz_projects_insert on public.biz_projects for insert to authenticated
  with check (public.biz_has_role(org_id, array['titolare', 'admin', 'manager']));
create policy biz_projects_update on public.biz_projects for update to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin']) or owner_person_id = public.biz_my_person(org_id))
  with check (public.biz_has_role(org_id, array['titolare', 'admin', 'manager']));
create policy biz_projects_delete on public.biz_projects for delete to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin']));

create policy biz_pm_select on public.biz_project_members for select to authenticated using (public.biz_can_see_project(project_id));
create policy biz_pm_write on public.biz_project_members for all to authenticated
  using (public.biz_can_manage_project(project_id)) with check (public.biz_can_manage_project(project_id));

-- Compiti: i propri, quelli dei progetti visibili, tutti per titolare e admin.
create policy biz_tasks_select on public.biz_tasks for select to authenticated using (
  public.biz_has_role(org_id, array['titolare', 'admin'])
  or assignee_person_id = public.biz_my_person(org_id)
  or (project_id is not null and public.biz_can_see_project(project_id))
);
create policy biz_tasks_insert on public.biz_tasks for insert to authenticated with check (
  public.biz_has_role(org_id, array['titolare', 'admin', 'manager'])
  or (project_id is not null and public.biz_can_manage_project(project_id))
  or (public.biz_is_member(org_id) and assignee_person_id = public.biz_my_person(org_id))
);
create policy biz_tasks_update on public.biz_tasks for update to authenticated using (
  public.biz_has_role(org_id, array['titolare', 'admin'])
  or (project_id is not null and public.biz_can_manage_project(project_id))
  or assignee_person_id = public.biz_my_person(org_id)
) with check (public.biz_is_member(org_id));
create policy biz_tasks_delete on public.biz_tasks for delete to authenticated using (
  public.biz_has_role(org_id, array['titolare', 'admin'])
  or (project_id is not null and public.biz_can_manage_project(project_id))
);

-- Registro: lo leggono titolare e admin. Nessuna regola di scrittura: solo i trigger.
create policy biz_audit_select on public.biz_audit_log for select to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin']));
