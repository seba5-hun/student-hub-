-- MYND: elenco newsletter per l'admin.
-- Chi si iscrive (casella facoltativa alla registrazione, o da "Privacy e dati") ha nel proprio account
-- newsletter = true e la data del consenso. Qui l'admin legge solo chi ha VERIFICATO l'email.
-- Da incollare una volta in Supabase → SQL Editor → New query → Run.

create or replace function public.admin_newsletter()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_developer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'verified_users', (select count(*) from auth.users where email_confirmed_at is not null),
    'subscribers', coalesce((
      select jsonb_agg(x order by x.subscribed_at desc) from (
        select au.email,
               coalesce(au.raw_user_meta_data->>'name', au.raw_user_meta_data->>'full_name', '') as name,
               coalesce(au.raw_user_meta_data->>'newsletter_at', au.created_at::text) as subscribed_at
        from auth.users au
        where au.raw_user_meta_data->>'newsletter' = 'true' and au.email_confirmed_at is not null
      ) x), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_newsletter() from public, anon;
grant execute on function public.admin_newsletter() to authenticated;

notify pgrst, 'reload schema';
