-- MYND: "Elimina il mio account" (diritto alla cancellazione, art. 17 GDPR).
-- Da incollare una volta in Supabase → SQL Editor → New query → Run (dopo schema.sql).
--
-- L'app cancella prima i file dell'Archivio con le API di Storage, poi chiama questa funzione,
-- che elimina i suggerimenti scritti e poi l'utente: dati, chat e profilo spariscono a cascata
-- (le statistiche d'uso restano solo in forma anonima, senza collegamento all'account).

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.analytics_events set user_id = null where user_id = uid;
  if to_regclass('public.suggestions') is not null then
    execute 'delete from public.suggestions where user_id = $1' using uid;
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';
