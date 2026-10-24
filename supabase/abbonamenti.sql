-- MYND · Abbonamenti (Stripe) e codici per avere l'app gratis.
-- · Finché nel pannello Admin → Abbonamenti i pagamenti sono spenti, tutti usano l'app come oggi.
-- · Quando li accendi, ogni account ha la prova gratuita (dal giorno in cui si iscrive, o da quando
--   accendi i pagamenti per chi c'era già), poi serve l'abbonamento o un codice.
-- · Lo stato dell'abbonamento lo scrive solo il server (il webhook di Stripe con la chiave
--   service_role, mai nel browser): nessun utente può darselo da solo.
-- Richiede schema.sql (is_developer). Si può rieseguire senza perdere dati.

create table if not exists public.billing_settings (
  id                 boolean primary key default true check (id),
  enabled            boolean not null default false,
  enabled_at         timestamptz,
  trial_days         integer not null default 14 check (trial_days between 0 and 365),
  price_month_cents  integer not null default 399 check (price_month_cents between 50 and 100000),
  price_year_cents   integer not null default 3299 check (price_year_cents between 50 and 1000000),
  updated_at         timestamptz not null default now()
);
insert into public.billing_settings (id) values (true) on conflict (id) do nothing;
alter table public.billing_settings enable row level security;
-- Nessuna policy: si legge con my_access() e si cambia con admin_set_billing().

-- Un abbonamento Stripe per account (scritto solo dal webhook).
create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id     text unique,
  stripe_subscription_id text,
  status                 text not null default 'none',
  plan                   text check (plan in ('mensile', 'annuale')),
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  updated_at             timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions_read_own" on public.subscriptions;
create policy "subscriptions_read_own" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

-- Codici creati dall'admin: per sempre o per N mesi, per 1 persona o per N, con o senza scadenza.
create table if not exists public.access_codes (
  code        text primary key check (code ~ '^[A-Z0-9-]{4,32}$'),
  note        text check (char_length(note) <= 200),
  months      integer check (months between 1 and 120),   -- vuoto = gratis per sempre
  max_uses    integer check (max_uses between 1 and 100000), -- vuoto = senza limite
  uses        integer not null default 0,
  expires_at  timestamptz,                                -- vuoto = si può usare sempre
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.access_codes enable row level security;

create table if not exists public.code_redemptions (
  code         text not null references public.access_codes (code) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  redeemed_at  timestamptz not null default now(),
  free_until   timestamptz,                               -- vuoto = per sempre
  primary key (code, user_id)
);
create index if not exists code_redemptions_user on public.code_redemptions (user_id);
alter table public.code_redemptions enable row level security;

-- Tentativi di inserire un codice: al massimo 10 all'ora, così i codici non si indovinano a tentativi.
create table if not exists public.code_attempts (
  user_id  uuid not null references auth.users (id) on delete cascade,
  at       timestamptz not null default now()
);
create index if not exists code_attempts_user on public.code_attempts (user_id, at);
alter table public.code_attempts enable row level security;

-- Cosa può fare l'account che sta usando l'app, e perché.
create or replace function public.my_access()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare
  s public.billing_settings;
  joined timestamptz;
  sub public.subscriptions;
  forever boolean;
  code_until timestamptz;
  trial_end timestamptz;
  paid boolean;
  admin boolean := public.is_developer();
begin
  if auth.uid() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into s from public.billing_settings where id;
  select created_at into joined from auth.users where id = auth.uid();
  select * into sub from public.subscriptions where user_id = auth.uid();
  select coalesce(bool_or(free_until is null), false), max(free_until) into forever, code_until
    from public.code_redemptions where user_id = auth.uid();
  trial_end := greatest(joined, coalesce(s.enabled_at, now())) + make_interval(days => coalesce(s.trial_days, 14));
  -- "past_due": Stripe sta ritentando il pagamento, l'app resta aperta finché non rinuncia.
  paid := coalesce(sub.status in ('active', 'trialing', 'past_due'), false);
  return jsonb_build_object(
    'enabled', coalesce(s.enabled, false),
    'admin', admin,
    'trial_days', coalesce(s.trial_days, 14),
    'trial_end', trial_end,
    'price_month_cents', coalesce(s.price_month_cents, 399),
    'price_year_cents', coalesce(s.price_year_cents, 3299),
    'status', coalesce(sub.status, 'none'),
    'plan', sub.plan,
    'period_end', sub.current_period_end,
    'cancel_at_period_end', coalesce(sub.cancel_at_period_end, false),
    'has_customer', sub.stripe_customer_id is not null,
    'code_forever', forever,
    'code_until', code_until,
    'has_access', not coalesce(s.enabled, false) or admin or paid or forever
                  or coalesce(code_until > now(), false) or trial_end > now()
  );
end;
$$;

-- Usa un codice. Non lancia errori (così il tentativo resta contato): risponde { ok, error | access }.
create or replace function public.redeem_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  c public.access_codes;
  v text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  tries integer;
begin
  if auth.uid() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select count(*) into tries from public.code_attempts where user_id = auth.uid() and at > now() - interval '1 hour';
  if tries >= 10 then
    return jsonb_build_object('ok', false, 'error', 'Troppi tentativi: riprova tra un''ora.');
  end if;
  insert into public.code_attempts (user_id) values (auth.uid());
  delete from public.code_attempts where at < now() - interval '1 day';

  select * into c from public.access_codes where code = v for update;
  if not found or not c.active then
    return jsonb_build_object('ok', false, 'error', 'Codice non valido. Controlla di averlo scritto bene.');
  end if;
  if c.expires_at is not null and c.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'Questo codice è scaduto.');
  end if;
  if exists (select 1 from public.code_redemptions where code = v and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'Hai già usato questo codice.');
  end if;
  if c.max_uses is not null and c.uses >= c.max_uses then
    return jsonb_build_object('ok', false, 'error', 'Questo codice è già stato usato da tutte le persone previste.');
  end if;
  insert into public.code_redemptions (code, user_id, free_until)
  values (v, auth.uid(), case when c.months is null then null else now() + make_interval(months => c.months) end);
  update public.access_codes set uses = uses + 1 where code = v;
  return jsonb_build_object('ok', true, 'access', public.my_access());
end;
$$;

-- Pannello Admin → Abbonamenti.
create or replace function public.admin_billing()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_developer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'settings', (select to_jsonb(s) - 'id' from public.billing_settings s where id),
    'counts', jsonb_build_object(
      'active', (select count(*) from public.subscriptions where status in ('active', 'past_due')),
      'trialing', (select count(*) from public.subscriptions where status = 'trialing'),
      'mensile', (select count(*) from public.subscriptions where status in ('active', 'trialing', 'past_due') and plan = 'mensile'),
      'annuale', (select count(*) from public.subscriptions where status in ('active', 'trialing', 'past_due') and plan = 'annuale'),
      'codes', (select count(distinct user_id) from public.code_redemptions where free_until is null or free_until > now())
    ),
    'subscribers', coalesce((
      select jsonb_agg(x order by x.updated_at desc) from (
        select au.email, s.status, s.plan, s.current_period_end, s.cancel_at_period_end, s.updated_at
        from public.subscriptions s join auth.users au on au.id = s.user_id
        where s.status <> 'none' order by s.updated_at desc limit 200
      ) x), '[]'::jsonb),
    'codes', coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select c.*, coalesce((
          select jsonb_agg(jsonb_build_object('email', au.email, 'redeemed_at', r.redeemed_at, 'free_until', r.free_until) order by r.redeemed_at desc)
          from public.code_redemptions r join auth.users au on au.id = r.user_id where r.code = c.code
        ), '[]'::jsonb) as people
        from public.access_codes c
      ) x), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_set_billing(p_enabled boolean, p_trial_days integer, p_price_month_cents integer, p_price_year_cents integer)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_developer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.billing_settings set
    enabled = p_enabled,
    -- La prova di chi c'era già parte la prima volta che i pagamenti vengono accesi.
    enabled_at = case when p_enabled and enabled_at is null then now() else enabled_at end,
    trial_days = p_trial_days,
    price_month_cents = p_price_month_cents,
    price_year_cents = p_price_year_cents,
    updated_at = now()
  where id;
end;
$$;

create or replace function public.admin_create_code(p_code text, p_note text, p_months integer, p_max_uses integer, p_expires_at timestamptz)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
begin
  if not public.is_developer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v !~ '^[A-Z0-9-]{4,32}$' then
    raise exception 'Il codice deve avere da 4 a 32 caratteri: lettere, numeri o trattini.';
  end if;
  if exists (select 1 from public.access_codes where code = v) then
    raise exception 'Esiste già un codice %.', v;
  end if;
  insert into public.access_codes (code, note, months, max_uses, expires_at)
  values (v, nullif(btrim(p_note), ''), p_months, p_max_uses, p_expires_at);
end;
$$;

create or replace function public.admin_set_code_active(p_code text, p_active boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_developer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.access_codes set active = p_active where code = p_code;
end;
$$;

-- Elimina il codice: chi l'aveva usato perde l'accesso gratis che gli dava.
create or replace function public.admin_delete_code(p_code text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_developer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.access_codes where code = p_code;
end;
$$;

revoke all on function public.my_access() from public, anon;
revoke all on function public.redeem_code(text) from public, anon;
revoke all on function public.admin_billing() from public, anon;
revoke all on function public.admin_set_billing(boolean, integer, integer, integer) from public, anon;
revoke all on function public.admin_create_code(text, text, integer, integer, timestamptz) from public, anon;
revoke all on function public.admin_set_code_active(text, boolean) from public, anon;
revoke all on function public.admin_delete_code(text) from public, anon;
grant execute on function public.my_access() to authenticated;
grant execute on function public.redeem_code(text) to authenticated;
grant execute on function public.admin_billing() to authenticated;
grant execute on function public.admin_set_billing(boolean, integer, integer, integer) to authenticated;
grant execute on function public.admin_create_code(text, text, integer, integer, timestamptz) to authenticated;
grant execute on function public.admin_set_code_active(text, boolean) to authenticated;
grant execute on function public.admin_delete_code(text) to authenticated;

notify pgrst, 'reload schema';
