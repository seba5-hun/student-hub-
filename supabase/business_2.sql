-- MYND Business, parte 2: agenda, documenti, fatture, movimenti, proposte del Coach,
-- automazioni, dati di prova. Va eseguito DOPO business.sql. Si può rieseguire: non cancella dati.

-- ───────────────────────── Dati di prova: una colonna per riconoscerli ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['biz_counterparties', 'biz_contacts', 'biz_contracts', 'biz_contract_terms', 'biz_projects', 'biz_tasks'] loop
    execute format('alter table public.%I add column if not exists is_demo boolean not null default false', t);
  end loop;
end $$;

-- ───────────────────────── Nuove tabelle ─────────────────────────

create table if not exists public.biz_events (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.biz_orgs (id) on delete cascade,
  title            text not null check (length(trim(title)) between 1 and 200),
  kind             text not null default 'appuntamento'
                   check (kind in ('riunione', 'appuntamento', 'consegna', 'scadenza', 'pagamento', 'altro')),
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  all_day          boolean not null default false,
  location         text,
  counterparty_id  uuid,
  project_id       uuid,
  person_ids       uuid[] not null default '{}',
  notes            text,
  source           text not null default 'manuale' check (source in ('manuale', 'ai', 'automazione')),
  created_by       uuid default auth.uid(),
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (org_id, counterparty_id) references public.biz_counterparties (org_id, id) on delete set null (counterparty_id),
  foreign key (org_id, project_id) references public.biz_projects (org_id, id) on delete cascade
);
create index if not exists biz_events_org_start on public.biz_events (org_id, starts_at);

create table if not exists public.biz_documents (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.biz_orgs (id) on delete cascade,
  name             text not null,
  kind             text not null default 'altro'
                   check (kind in ('contratto', 'fattura', 'offerta', 'preventivo', 'procedura', 'email', 'altro')),
  storage_path     text,                      -- file nel bucket "business": {org_id}/...
  mime             text,
  size_bytes       bigint,
  text_content     text,                      -- testo letto, per la ricerca e per l'AI
  summary          text,
  counterparty_id  uuid,
  project_id       uuid,
  contract_id      uuid,
  confidential     boolean not null default false,
  created_by       uuid default auth.uid(),
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, counterparty_id) references public.biz_counterparties (org_id, id) on delete set null (counterparty_id),
  foreign key (org_id, project_id) references public.biz_projects (org_id, id) on delete set null (project_id),
  foreign key (org_id, contract_id) references public.biz_contracts (org_id, id) on delete set null (contract_id)
);
create index if not exists biz_documents_org on public.biz_documents (org_id, created_at desc);

create table if not exists public.biz_invoices (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.biz_orgs (id) on delete cascade,
  direction        text not null check (direction in ('emessa', 'ricevuta')),
  number           text,
  issue_date       date,
  due_date         date,
  counterparty_id  uuid,
  counterparty_name text,                     -- se il cliente non è ancora in anagrafica
  project_id       uuid,
  taxable          numeric(14, 2),
  vat              numeric(14, 2),
  total            numeric(14, 2) not null,
  status           text not null default 'aperta' check (status in ('aperta', 'pagata', 'annullata')),
  paid_at          date,
  source           text not null default 'manuale' check (source in ('manuale', 'xml', 'ai')),
  document_id      uuid,
  notes            text,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, counterparty_id) references public.biz_counterparties (org_id, id) on delete set null (counterparty_id),
  foreign key (org_id, project_id) references public.biz_projects (org_id, id) on delete set null (project_id),
  foreign key (org_id, document_id) references public.biz_documents (org_id, id) on delete set null (document_id)
);
create index if not exists biz_invoices_org_due on public.biz_invoices (org_id, due_date);

create table if not exists public.biz_transactions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.biz_orgs (id) on delete cascade,
  date         date not null,
  amount       numeric(14, 2) not null,      -- positivo entrata, negativo uscita
  description  text,
  category     text,
  invoice_id   uuid,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  foreign key (org_id, invoice_id) references public.biz_invoices (org_id, id) on delete set null (invoice_id)
);
create index if not exists biz_transactions_org_date on public.biz_transactions (org_id, date desc);

-- Proposte del Coach (e delle automazioni): restano "in attesa" finché una persona non decide.
-- applied contiene le righe create o modificate, per poter annullare.
create table if not exists public.biz_proposals (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.biz_orgs (id) on delete cascade,
  title        text not null,
  summary      text,
  actions      jsonb not null default '[]'::jsonb,
  source       text not null default 'coach' check (source in ('coach', 'documento', 'email', 'automazione')),
  source_text  text,
  status       text not null default 'in_attesa' check (status in ('in_attesa', 'applicata', 'scartata', 'annullata')),
  applied      jsonb not null default '[]'::jsonb,
  created_by   uuid default auth.uid(),
  decided_by   uuid,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists biz_proposals_org on public.biz_proposals (org_id, status, created_at desc);

create table if not exists public.biz_automations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.biz_orgs (id) on delete cascade,
  template     text not null,
  name         text not null,
  active       boolean not null default true,
  config       jsonb not null default '{}'::jsonb,
  last_run_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (org_id, template)
);

create table if not exists public.biz_automation_runs (
  id             bigint generated always as identity primary key,
  org_id         uuid not null references public.biz_orgs (id) on delete cascade,
  automation_id  uuid references public.biz_automations (id) on delete cascade,
  at             timestamptz not null default now(),
  summary        text not null,
  details        jsonb not null default '{}'::jsonb
);
create index if not exists biz_runs_org_at on public.biz_automation_runs (org_id, at desc);

-- ───────────────────────── Trigger (aggiornamento e registro) ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['biz_events', 'biz_documents', 'biz_invoices'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.biz_touch()', t || '_touch', t);
  end loop;
  foreach t in array array['biz_events', 'biz_documents', 'biz_invoices', 'biz_transactions', 'biz_automations'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.biz_audit()', t || '_audit', t);
  end loop;
end $$;

-- Le righe create applicando una proposta del Coach risultano "AI" nel registro attività.
create or replace function public.biz_tag_ai(p_org uuid, p_row_ids text[])
returns void language sql security definer set search_path = public as $$
  update public.biz_audit_log set actor_kind = 'ai'
  where org_id = p_org and actor_user = auth.uid() and row_id = any (p_row_ids)
    and at > now() - interval '15 minutes' and public.biz_is_member(p_org);
$$;
revoke all on function public.biz_tag_ai(uuid, text[]) from public, anon;
grant execute on function public.biz_tag_ai(uuid, text[]) to authenticated;

-- ───────────────────────── Regole di accesso ─────────────────────────

alter table public.biz_events          enable row level security;
alter table public.biz_documents       enable row level security;
alter table public.biz_invoices        enable row level security;
alter table public.biz_transactions    enable row level security;
alter table public.biz_proposals       enable row level security;
alter table public.biz_automations     enable row level security;
alter table public.biz_automation_runs enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
           and tablename in ('biz_events', 'biz_documents', 'biz_invoices', 'biz_transactions', 'biz_proposals', 'biz_automations', 'biz_automation_runs') loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Agenda: la vede il team interno; i collaboratori esterni solo gli eventi dei loro progetti.
create policy biz_events_select on public.biz_events for select to authenticated using (
  public.biz_has_role(org_id, array['titolare', 'admin', 'manager', 'dipendente', 'finanza'])
  or (project_id is not null and public.biz_can_see_project(project_id))
);
create policy biz_events_insert on public.biz_events for insert to authenticated
  with check (public.biz_has_role(org_id, array['titolare', 'admin', 'manager', 'dipendente', 'finanza']));
create policy biz_events_update on public.biz_events for update to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin', 'manager']) or created_by = auth.uid())
  with check (public.biz_is_member(org_id));
create policy biz_events_delete on public.biz_events for delete to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin', 'manager']) or created_by = auth.uid());

-- Documenti: titolare, admin, manager e finanza tutti; gli altri quelli non riservati dei loro progetti.
create policy biz_docs_select on public.biz_documents for select to authenticated using (
  public.biz_has_role(org_id, array['titolare', 'admin', 'manager', 'finanza'])
  or (not confidential and project_id is not null and public.biz_can_see_project(project_id))
);
create policy biz_docs_insert on public.biz_documents for insert to authenticated
  with check (public.biz_has_role(org_id, array['titolare', 'admin', 'manager', 'finanza', 'dipendente']));
create policy biz_docs_update on public.biz_documents for update to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin', 'manager']) or created_by = auth.uid())
  with check (public.biz_is_member(org_id));
create policy biz_docs_delete on public.biz_documents for delete to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin', 'manager']) or created_by = auth.uid());

-- Fatture e movimenti: solo titolare, admin e finanza.
create policy biz_invoices_all on public.biz_invoices for all to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin', 'finanza']))
  with check (public.biz_has_role(org_id, array['titolare', 'admin', 'finanza']));
create policy biz_tx_all on public.biz_transactions for all to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin', 'finanza']))
  with check (public.biz_has_role(org_id, array['titolare', 'admin', 'finanza']));

-- Proposte: ognuno vede le sue; titolare e admin tutte.
create policy biz_prop_select on public.biz_proposals for select to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin']) or (created_by = auth.uid() and public.biz_is_member(org_id)));
create policy biz_prop_insert on public.biz_proposals for insert to authenticated
  with check (public.biz_is_member(org_id) and created_by = auth.uid());
create policy biz_prop_update on public.biz_proposals for update to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin']) or created_by = auth.uid())
  with check (public.biz_is_member(org_id));
create policy biz_prop_delete on public.biz_proposals for delete to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin']) or created_by = auth.uid());

-- Automazioni: le gestiscono titolare e admin; lo storico lo vedono loro.
create policy biz_auto_all on public.biz_automations for all to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin']))
  with check (public.biz_has_role(org_id, array['titolare', 'admin']));
create policy biz_runs_select on public.biz_automation_runs for select to authenticated
  using (public.biz_has_role(org_id, array['titolare', 'admin']));
create policy biz_runs_insert on public.biz_automation_runs for insert to authenticated
  with check (public.biz_has_role(org_id, array['titolare', 'admin']));

-- ───────────────────────── File dei documenti (bucket privato "business") ─────────────────────────
-- Percorso: {org_id}/{nome}. Possono leggere e caricare i membri interni dell'azienda.
insert into storage.buckets (id, name, public, file_size_limit)
values ('business', 'business', false, 26214400)
on conflict (id) do nothing;

drop policy if exists "business_select" on storage.objects;
drop policy if exists "business_insert" on storage.objects;
drop policy if exists "business_delete" on storage.objects;
create policy "business_select" on storage.objects for select to authenticated using (
  bucket_id = 'business'
  and public.biz_has_role(((storage.foldername(name))[1])::uuid, array['titolare', 'admin', 'manager', 'finanza', 'dipendente'])
);
create policy "business_insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'business'
  and public.biz_has_role(((storage.foldername(name))[1])::uuid, array['titolare', 'admin', 'manager', 'finanza', 'dipendente'])
);
create policy "business_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'business'
  and public.biz_has_role(((storage.foldername(name))[1])::uuid, array['titolare', 'admin', 'manager'])
);

-- ───────────────────────── Dati di prova ─────────────────────────
-- Un'azienda realistica (atleta con sponsor e collaborazioni), con date calcolate da oggi.
-- Solo il titolare può caricarli o toglierli; restano riconoscibili (is_demo) e si eliminano in un colpo.

create or replace function public.biz_clear_demo(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.biz_has_role(p_org, array['titolare']) then
    raise exception 'Solo il titolare può togliere i dati di prova' using errcode = '42501';
  end if;
  perform set_config('mynd.actor_kind', 'sistema', true);
  delete from public.biz_transactions where org_id = p_org and is_demo;
  delete from public.biz_invoices where org_id = p_org and is_demo;
  delete from public.biz_documents where org_id = p_org and is_demo;
  delete from public.biz_events where org_id = p_org and is_demo;
  delete from public.biz_tasks where org_id = p_org and is_demo;
  delete from public.biz_projects where org_id = p_org and is_demo;
  delete from public.biz_contract_terms where org_id = p_org and is_demo;
  delete from public.biz_contracts where org_id = p_org and is_demo;
  delete from public.biz_contacts where org_id = p_org and is_demo;
  delete from public.biz_counterparties where org_id = p_org and is_demo;
  delete from public.biz_people where org_id = p_org and user_id is null and email like '%@esempio.mynd';
end;
$$;

create or replace function public.biz_seed_demo(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  d date := current_date;
  me uuid;
  p_marco uuid; p_giulia uuid; p_luca uuid;
  c_rrd uuid; c_studio uuid; c_gym uuid; c_coach uuid;
  k_rrd uuid; k_gym uuid; k_studio uuid;
  pr_shoot uuid; pr_camp uuid; pr_video uuid;
  doc_rrd uuid;
begin
  if not public.biz_has_role(p_org, array['titolare']) then
    raise exception 'Solo il titolare può caricare i dati di prova' using errcode = '42501';
  end if;
  perform public.biz_clear_demo(p_org);
  perform set_config('mynd.actor_kind', 'sistema', true);
  me := public.biz_my_person(p_org);

  insert into public.biz_people (org_id, name, email, role, job_title, department, skills, availability) values
    (p_org, 'Marco Rossi', 'marco@esempio.mynd', 'manager', 'Videomaker', 'Contenuti',
     '[{"name":"Montaggio video","level":5},{"name":"Fotografia","level":4},{"name":"Droni","level":3}]', '{"hours_week":30}')
    returning id into p_marco;
  insert into public.biz_people (org_id, name, email, role, job_title, department, skills, availability) values
    (p_org, 'Giulia Verdi', 'giulia@esempio.mynd', 'dipendente', 'Social media manager', 'Marketing',
     '[{"name":"Instagram","level":5},{"name":"Copywriting","level":4},{"name":"Grafica","level":3}]', '{"hours_week":20}')
    returning id into p_giulia;
  insert into public.biz_people (org_id, name, email, role, job_title, department, skills, availability) values
    (p_org, 'Luca Bianchi', 'luca@esempio.mynd', 'finanza', 'Commercialista', 'Amministrazione',
     '[{"name":"Fatturazione","level":5},{"name":"Fisco","level":5}]', '{"hours_week":4}')
    returning id into p_luca;

  insert into public.biz_counterparties (org_id, kind, name, legal_name, sector, importance, payment_terms_days, vat, website, is_demo)
  values (p_org, 'partner', 'RRD', 'Roberto Ricci Designs S.r.l.', 'Attrezzatura e abbigliamento windsurf, kite e wing', 'A', 30, 'IT00000000001', 'robertoricci.com', true)
  returning id into c_rrd;
  insert into public.biz_counterparties (org_id, kind, name, sector, importance, payment_terms_days, is_demo)
  values (p_org, 'cliente', 'Studio Onde', 'Agenzia di comunicazione', 'B', 60, true) returning id into c_studio;
  insert into public.biz_counterparties (org_id, kind, name, sector, importance, payment_terms_days, is_demo)
  values (p_org, 'partner', 'Palestra Atlas', 'Centro fitness', 'B', 30, true) returning id into c_gym;
  insert into public.biz_counterparties (org_id, kind, name, sector, importance, is_demo)
  values (p_org, 'fornitore', 'Coach Wing Academy', 'Allenamento wingfoil', 'C', true) returning id into c_coach;

  insert into public.biz_contacts (org_id, counterparty_id, name, role, email, phone, is_demo) values
    (p_org, c_rrd, 'Elena Ricci', 'Team manager atleti', 'elena@esempio.mynd', '+39 333 0000001', true),
    (p_org, c_rrd, 'Paolo Neri', 'Marketing', 'paolo@esempio.mynd', null, true),
    (p_org, c_studio, 'Sara Blu', 'Account', 'sara@esempio.mynd', '+39 333 0000002', true),
    (p_org, c_gym, 'Davide Gialli', 'Titolare', 'davide@esempio.mynd', null, true);

  insert into public.biz_contracts (org_id, counterparty_id, title, start_date, end_date, auto_renew, notice_days, value, status, notes, is_demo)
  values (p_org, c_rrd, 'Sponsorizzazione atleta ' || extract(year from d)::int, date_trunc('year', d)::date, (date_trunc('year', d) + interval '1 year - 1 day')::date,
          true, 60, 6000, 'attivo', 'Compenso in due rate (marzo e settembre) più materiale tecnico.', true)
  returning id into k_rrd;
  insert into public.biz_contracts (org_id, counterparty_id, title, start_date, end_date, auto_renew, notice_days, value, status, is_demo)
  values (p_org, c_gym, 'Accordo di collaborazione', d - 120, d + 245, false, 30, 1200, 'attivo', true) returning id into k_gym;
  insert into public.biz_contracts (org_id, counterparty_id, title, start_date, end_date, value, status, is_demo)
  values (p_org, c_studio, 'Campagna video autunno', d - 20, d + 40, 2500, 'attivo', true) returning id into k_studio;

  insert into public.biz_contract_terms (org_id, contract_id, party, kind, description, every_n, every_unit, due_date, quota, used, owner_person_id, source_excerpt, is_demo) values
    (p_org, k_rrd, 'noi', 'obbligo', '2 post Instagram al mese con i prodotti RRD e il tag @rrdinternational', 1, 'mesi', null, null, 0, p_giulia, 'Art. 4.1 – L''Atleta pubblica almeno due contenuti al mese…', true),
    (p_org, k_rrd, 'noi', 'obbligo', 'Usare in gara solo vele e tavole RRD', null, null, null, null, 0, me, 'Art. 3.2', true),
    (p_org, k_rrd, 'noi', 'obbligo', 'Partecipare al catalog shooting di primavera', null, null, d + 25, null, 0, me, 'Art. 4.3', true),
    (p_org, k_rrd, 'noi', 'diritto', 'Kit attrezzatura completo a stagione', null, null, null, 2, 1, me, 'Art. 5.1', true),
    (p_org, k_rrd, 'controparte', 'obbligo', 'Pagare la seconda rata del compenso (3.000 €)', null, null, d + 12, null, 0, p_luca, 'Art. 6.2', true),
    (p_org, k_rrd, 'controparte', 'diritto', 'Usare le immagini dell''atleta nelle campagne per 24 mesi', null, null, null, null, 0, null, 'Art. 7', true),
    (p_org, k_gym, 'noi', 'obbligo', 'Una storia Instagram a settimana dalla palestra', 1, 'settimane', null, null, 0, p_giulia, null, true),
    (p_org, k_gym, 'controparte', 'obbligo', 'Ingresso gratuito e programma di preparazione atletica', null, null, null, null, 0, null, null, true),
    (p_org, k_studio, 'noi', 'obbligo', 'Consegnare 3 video verticali da 30 secondi', null, null, d + 6, 3, 1, p_marco, null, true),
    (p_org, k_studio, 'controparte', 'diritto', 'Due giri di revisioni gratuite', null, null, null, 2, 2, p_marco, null, true);

  insert into public.biz_projects (org_id, name, objective, counterparty_id, owner_person_id, start_date, deadline, budget, status, is_demo)
  values (p_org, 'Catalog shooting RRD', '30 foto e 4 video con la nuova collezione', c_rrd, p_marco, d - 10, d + 25, 1800, 'attivo', true) returning id into pr_shoot;
  insert into public.biz_projects (org_id, name, objective, counterparty_id, owner_person_id, start_date, deadline, budget, status, is_demo)
  values (p_org, 'Campagna video autunno', '3 video verticali per i social del cliente', c_studio, p_marco, d - 20, d + 6, 2500, 'attivo', true) returning id into pr_camp;
  insert into public.biz_projects (org_id, name, objective, owner_person_id, start_date, deadline, budget, status, is_demo)
  values (p_org, 'Canale YouTube allenamenti', 'Una serie di 8 episodi sulla preparazione alle gare', me, d - 5, d + 60, 600, 'attivo', true) returning id into pr_video;

  insert into public.biz_project_members (org_id, project_id, person_id, project_role, sees) values
    (p_org, pr_shoot, p_giulia, 'Social', '{"tasks":true,"documents":true,"client":true,"finance":false}'),
    (p_org, pr_camp, p_giulia, 'Copy', '{"tasks":true,"documents":false,"client":true,"finance":false}');

  insert into public.biz_tasks (org_id, project_id, title, assignee_person_id, due_date, estimate_minutes, importance, status, is_demo) values
    (p_org, pr_camp, 'Montare il video 2 di 3', p_marco, d - 1, 240, 5, 'in_corso', true),
    (p_org, pr_camp, 'Montare il video 3 di 3', p_marco, d + 3, 240, 4, 'da_fare', true),
    (p_org, pr_camp, 'Scrivere i testi dei post', p_giulia, d + 2, 60, 3, 'da_fare', true),
    (p_org, pr_camp, 'Montare il video 1 di 3', p_marco, d - 6, 240, 4, 'fatto', true),
    (p_org, pr_shoot, 'Scegliere la location dello shooting', me, d + 4, 60, 4, 'da_fare', true),
    (p_org, pr_shoot, 'Preparare la lista degli scatti', p_marco, d + 10, 90, 3, 'da_fare', true),
    (p_org, pr_shoot, 'Confermare data e meteo con RRD', me, d, 20, 5, 'da_fare', true),
    (p_org, pr_video, 'Scaletta dei primi 3 episodi', me, d + 7, 120, 3, 'da_fare', true),
    (p_org, null, 'Mandare a Luca le ricevute del mese', me, d + 1, 15, 3, 'da_fare', true);

  insert into public.biz_events (org_id, title, kind, starts_at, ends_at, location, counterparty_id, project_id, person_ids, source, is_demo) values
    (p_org, 'Call con Elena di RRD sul catalog', 'riunione', ((d + time '11:00') at time zone 'Europe/Rome'), ((d + time '11:30') at time zone 'Europe/Rome'), 'Google Meet', c_rrd, pr_shoot, array[me], 'manuale', true),
    (p_org, 'Revisione video con Studio Onde', 'riunione', ((d + 1 + time '15:00') at time zone 'Europe/Rome'), ((d + 1 + time '16:00') at time zone 'Europe/Rome'), 'Milano', c_studio, pr_camp, array[p_marco], 'manuale', true),
    (p_org, 'Consegna video campagna autunno', 'consegna', ((d + 6 + time '18:00') at time zone 'Europe/Rome'), null, null, c_studio, pr_camp, array[p_marco], 'manuale', true),
    (p_org, 'Shooting catalogo RRD', 'appuntamento', ((d + 25 + time '09:00') at time zone 'Europe/Rome'), ((d + 25 + time '17:00') at time zone 'Europe/Rome'), 'Lago di Garda', c_rrd, pr_shoot, array[me, p_marco], 'manuale', true),
    (p_org, 'Allenamento video per palestra Atlas', 'appuntamento', ((d + 3 + time '18:00') at time zone 'Europe/Rome'), ((d + 3 + time '19:00') at time zone 'Europe/Rome'), 'Palestra Atlas', c_gym, null, array[me], 'manuale', true);

  insert into public.biz_documents (org_id, name, kind, text_content, summary, counterparty_id, contract_id, is_demo)
  values (p_org, 'Contratto sponsorizzazione RRD.pdf', 'contratto',
    'CONTRATTO DI SPONSORIZZAZIONE. Art. 3.2 L''Atleta usa in gara esclusivamente attrezzatura RRD. Art. 4.1 L''Atleta pubblica almeno due contenuti al mese con i prodotti RRD. Art. 4.3 Partecipazione al catalog shooting di primavera. Art. 5.1 RRD fornisce due kit completi a stagione. Art. 6 Compenso annuo 6.000 euro in due rate da 3.000 euro (marzo e settembre), pagamento a 30 giorni. Art. 7 RRD può usare le immagini dell''Atleta per 24 mesi. Art. 9 Rinnovo tacito annuale salvo disdetta con 60 giorni di preavviso.',
    'Sponsorizzazione annuale: 6.000 € in due rate, 2 post al mese, attrezzatura esclusiva RRD, 2 kit a stagione, rinnovo tacito con 60 giorni di preavviso.',
    c_rrd, k_rrd, true) returning id into doc_rrd;
  insert into public.biz_documents (org_id, name, kind, text_content, summary, counterparty_id, project_id, is_demo)
  values (p_org, 'Brief campagna autunno - Studio Onde.pdf', 'offerta',
    'Brief: 3 video verticali da 30 secondi, consegna entro fine mese, due giri di revisioni inclusi, compenso 2.500 euro + IVA, pagamento a 60 giorni fine mese.',
    '3 video verticali, 2 revisioni incluse, 2.500 € + IVA a 60 giorni.', c_studio, pr_camp, true);

  insert into public.biz_invoices (org_id, direction, number, issue_date, due_date, counterparty_id, project_id, taxable, vat, total, status, paid_at, source, is_demo) values
    (p_org, 'emessa', '2026/014', d - 50, d - 20, c_rrd, null, 3000, 0, 3000, 'pagata', d - 18, 'manuale', true),
    (p_org, 'emessa', '2026/019', d - 35, d - 5, c_gym, null, 491.80, 108.20, 600, 'aperta', null, 'manuale', true),
    (p_org, 'emessa', '2026/021', d - 3, d + 57, c_studio, pr_camp, 1250, 275, 1525, 'aperta', null, 'manuale', true),
    (p_org, 'ricevuta', 'A-332', d - 12, d + 8, c_coach, null, 409.84, 90.16, 500, 'aperta', null, 'xml', true),
    (p_org, 'ricevuta', 'F-77', d - 40, d - 10, null, pr_shoot, 245.90, 54.10, 300, 'pagata', d - 9, 'ai', true);
  update public.biz_invoices set counterparty_name = 'Noleggio Furgoni Garda' where org_id = p_org and number = 'F-77' and is_demo;

  insert into public.biz_transactions (org_id, date, amount, description, category, is_demo) values
    (p_org, d - 18, 3000, 'Bonifico RRD rata 1', 'Sponsorizzazioni', true),
    (p_org, d - 9, -300, 'Noleggio furgone shooting', 'Trasferte', true),
    (p_org, d - 7, -89, 'Abbonamento software montaggio', 'Software', true),
    (p_org, d - 4, -150, 'Carburante e pedaggi', 'Trasferte', true),
    (p_org, d - 2, 450, 'Gara: premio piazzamento', 'Premi', true);

  update public.biz_orgs set settings = settings || jsonb_build_object('cash_balance', 4200, 'cash_balance_date', d)
  where id = p_org;
end;
$$;
revoke all on function public.biz_seed_demo(uuid) from public, anon;
revoke all on function public.biz_clear_demo(uuid) from public, anon;
grant execute on function public.biz_seed_demo(uuid) to authenticated;
grant execute on function public.biz_clear_demo(uuid) to authenticated;
