-- MYND: personalizzazioni su misura (a pacchetti).
-- Lo studente descrive la sua idea all'Assistente MYND (Home → Personalizza): l'AI prepara la funzione e la richiesta arriva
-- in Admin → Personalizzazioni. L'admin controlla la sicurezza, prova l'anteprima e approva:
-- solo allora la funzione compare nella MYND di quello studente (e di nessun altro).
-- Ogni richiesta usa una personalizzazione del pacchetto (se viene rifiutata, torna disponibile).
-- Ogni account ha 2 personalizzazioni incluse; quelle dei pacchetti si aggiungono.
-- Si può rieseguire senza perdere dati (aggiorna regole e funzioni).
-- Da incollare una volta in Supabase → SQL Editor → New query → Run (dopo schema.sql).

-- Quante personalizzazioni ha ogni persona (le assegna l'admin). Chi non è in questa tabella ha
-- quelle incluse (2).
create table if not exists public.custom_plans (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  credits     integer not null default 2 check (credits between 0 and 1000),
  package     text check (char_length(package) <= 60),
  updated_at  timestamptz not null default now()
);

alter table public.custom_plans alter column credits set default 2;   -- per chi aveva già lo script
alter table public.custom_plans enable row level security;

drop policy if exists "custom_plans_select_own" on public.custom_plans;
create policy "custom_plans_select_own" on public.custom_plans
  for select to authenticated
  using (user_id = (select auth.uid()));
-- Nessuna policy di modifica: i pacchetti li assegna solo l'admin con le funzioni qui sotto.

-- Le richieste: l'idea dello studente e la funzione preparata dall'AI.
create table if not exists public.custom_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title        text not null check (char_length(title) between 1 and 60),
  idea         text not null check (char_length(idea) between 3 and 4000),
  kind         text not null default 'new' check (kind in ('new', 'update')),
  target_app   text check (char_length(target_app) <= 80),       -- per le modifiche: la funzione da cambiare
  placement    jsonb not null default '{}'::jsonb,                -- dove metterla e quali permessi chiede
  html         text not null default '' check (char_length(html) <= 150000),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note   text check (char_length(admin_note) <= 1000),
  review       jsonb,                                             -- analisi di sicurezza fatta dall'admin
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);

create index if not exists custom_requests_user_idx on public.custom_requests (user_id, created_at desc);

alter table public.custom_requests enable row level security;

-- Quante personalizzazioni restano e quante richieste ha inviato oggi chi sta usando l'app.
-- Sono funzioni (security definer) perché una regola non può leggere la sua stessa tabella:
-- Postgres lo blocca con "infinite recursion detected in policy".
create or replace function public.my_custom_left()
returns integer language sql stable security definer set search_path = public as $$
  select (select coalesce(max(p.credits), 2) from public.custom_plans p where p.user_id = auth.uid())
       - (select count(*) from public.custom_requests r where r.user_id = auth.uid() and r.status <> 'rejected')::integer;
$$;

create or replace function public.my_custom_today()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.custom_requests r where r.user_id = auth.uid() and r.created_at > now() - interval '1 day';
$$;

revoke all on function public.my_custom_left() from public, anon;
revoke all on function public.my_custom_today() from public, anon;
grant execute on function public.my_custom_left() to authenticated;
grant execute on function public.my_custom_today() to authenticated;

-- Si può inviare una richiesta solo a proprio nome, solo "in attesa" e solo se il pacchetto lo
-- permette (le richieste rifiutate non contano). Al massimo 10 al giorno.
drop policy if exists "custom_requests_insert_own" on public.custom_requests;
create policy "custom_requests_insert_own" on public.custom_requests
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and admin_note is null and review is null and reviewed_at is null
    and public.my_custom_left() > 0
    and public.my_custom_today() < 10
  );

drop policy if exists "custom_requests_select_own" on public.custom_requests;
create policy "custom_requests_select_own" on public.custom_requests
  for select to authenticated
  using (user_id = (select auth.uid()));
-- Nessuna policy di modifica o eliminazione per gli utenti: una richiesta approvata non si può
-- cambiare dopo il controllo.

-- Invio di una richiesta dall'app: controlla account, personalizzazioni rimaste e limite giornaliero
-- e, se qualcosa non va, dice esattamente cosa (es. "ne hai usate 2 su 2").
create or replace function public.send_custom_request(p_title text, p_idea text, p_kind text, p_target_app text, p_placement jsonb)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_credits integer; v_used integer; v_today integer; v_id uuid;
begin
  if v_user is null then
    raise exception 'Per inviare la richiesta devi essere entrato nel tuo account.';
  end if;
  if char_length(trim(coalesce(p_idea, ''))) < 3 then
    raise exception 'La richiesta è vuota: descrivi meglio la tua idea.';
  end if;
  select coalesce(max(credits), 2) into v_credits from public.custom_plans where user_id = v_user;
  select count(*) into v_used from public.custom_requests where user_id = v_user and status <> 'rejected';
  if v_used >= v_credits then
    raise exception 'Hai finito le personalizzazioni: ne hai usate % su %.', v_used, v_credits;
  end if;
  select count(*) into v_today from public.custom_requests where user_id = v_user and created_at > now() - interval '1 day';
  if v_today >= 10 then
    raise exception 'Hai già inviato 10 richieste oggi: riprova domani.';
  end if;
  insert into public.custom_requests (user_id, title, idea, kind, target_app, placement, html)
  values (v_user, left(coalesce(nullif(trim(p_title), ''), 'Personalizzazione'), 60), left(p_idea, 4000),
          case when p_kind = 'update' then 'update' else 'new' end,
          nullif(left(coalesce(p_target_app, ''), 80), ''), coalesce(p_placement, '{}'::jsonb), '')
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.send_custom_request(text, text, text, text, jsonb) from public, anon;
grant execute on function public.send_custom_request(text, text, text, text, jsonb) to authenticated;

-- ───────────────────────── Funzioni dell'admin ─────────────────────────

create or replace function public.admin_custom_requests()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_developer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by (x.status = 'pending') desc, x.created_at desc) from (
      select r.id, r.user_id, r.title, r.idea, r.kind, r.target_app, r.placement, r.html, r.status,
             r.admin_note, r.review, r.created_at, r.reviewed_at, au.email
      from public.custom_requests r left join auth.users au on au.id = r.user_id
      order by r.created_at desc limit 300
    ) x), '[]'::jsonb);
end;
$$;

-- Approva o rifiuta (con una nota), corregge il codice, salva l'analisi di sicurezza.
-- I campi lasciati vuoti (null) restano com'erano.
create or replace function public.admin_update_custom_request(
  p_id uuid, p_status text default null, p_note text default null, p_html text default null, p_review jsonb default null)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_developer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'invalid status';
  end if;
  if p_status = 'approved' and char_length(coalesce(p_html, (select html from public.custom_requests where id = p_id), '')) = 0 then
    raise exception 'Manca il codice della funzione: incollalo prima di approvare.';
  end if;
  update public.custom_requests set
    status      = coalesce(p_status, status),
    admin_note  = coalesce(p_note, admin_note),
    html        = coalesce(p_html, html),
    review      = coalesce(p_review, review),
    reviewed_at = case when p_status is not null and p_status <> 'pending' then now() else reviewed_at end
  where id = p_id;
end;
$$;

-- Cambia dove va la funzione (es. "in cima al Timer Studio" invece di "al posto del Timer").
create or replace function public.admin_set_custom_placement(p_id uuid, p_place text, p_position text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_developer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.custom_requests
  set placement = jsonb_set(jsonb_set(coalesce(placement, '{}'::jsonb), '{place}', to_jsonb(left(coalesce(p_place, 'section'), 40))),
                            '{position}', to_jsonb(left(coalesce(p_position, ''), 20)))
  where id = p_id;
end;
$$;

revoke all on function public.admin_set_custom_placement(uuid, text, text) from public, anon;
grant execute on function public.admin_set_custom_placement(uuid, text, text) to authenticated;

-- Pacchetti: aggiunge (o toglie, con un numero negativo) personalizzazioni a un'email.
create or replace function public.admin_add_custom_credits(p_email text, p_add integer, p_package text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid; v_credits integer;
begin
  if not public.is_developer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Nessun account con questa email.';
  end if;
  insert into public.custom_plans (user_id, credits, package, updated_at)
  values (v_user, greatest(0, 2 + p_add), nullif(trim(coalesce(p_package, '')), ''), now())   -- le 2 incluse + il pacchetto
  on conflict (user_id) do update set
    credits = greatest(0, public.custom_plans.credits + p_add),
    package = coalesce(nullif(trim(coalesce(p_package, '')), ''), public.custom_plans.package),
    updated_at = now()
  returning credits into v_credits;
  return jsonb_build_object('email', lower(trim(p_email)), 'credits', v_credits);
end;
$$;

create or replace function public.admin_custom_plans()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_developer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by x.updated_at desc) from (
      select p.user_id, au.email, p.credits, p.package, p.updated_at,
             (select count(*) from public.custom_requests r where r.user_id = p.user_id and r.status <> 'rejected') as used
      from public.custom_plans p left join auth.users au on au.id = p.user_id
    ) x), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_custom_requests() from public, anon;
revoke all on function public.admin_update_custom_request(uuid, text, text, text, jsonb) from public, anon;
revoke all on function public.admin_add_custom_credits(text, integer, text) from public, anon;
revoke all on function public.admin_custom_plans() from public, anon;
grant execute on function public.admin_custom_requests() to authenticated;
grant execute on function public.admin_update_custom_request(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.admin_add_custom_credits(text, integer, text) to authenticated;
grant execute on function public.admin_custom_plans() to authenticated;
