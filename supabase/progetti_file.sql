-- MYND Performance · Fase 3: documenti di Google Drive pubblicati nei progetti, e cartelle.
-- I file restano nel Google Drive di chi li pubblica: qui si salvano solo il link e con chi è
-- condiviso. Richiede progetti.sql. Si può rieseguire senza perdere dati.

alter table public.prj_resources add column if not exists folder     text;
alter table public.prj_resources add column if not exists drive_id   text;
alter table public.prj_resources add column if not exists mime       text;
alter table public.prj_resources add column if not exists size_bytes bigint;
alter table public.prj_resources add column if not exists sharing    jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.prj_resources add constraint prj_resources_folder_len check (folder is null or char_length(folder) <= 80);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.prj_resources add constraint prj_resources_drive_id check (drive_id is null or drive_id ~ '^[A-Za-z0-9_-]{10,200}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.prj_resources add constraint prj_resources_mime_len check (mime is null or char_length(mime) <= 200);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.prj_resources add constraint prj_resources_size check (size_bytes is null or size_bytes >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.prj_resources add constraint prj_resources_sharing check (jsonb_typeof(sharing) = 'object' and pg_column_size(sharing) <= 20000);
exception when duplicate_object then null; end $$;

create index if not exists prj_resources_folder on public.prj_resources (project_id, folder);

-- "Ultimi aggiornamenti": anche i documenti pubblicati.
create or replace function public.prj_resource_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.prj_log(new.project_id, format(case new.kind
    when 'nota' then 'ha aggiunto la nota “%s”'
    when 'file' then 'ha pubblicato il documento “%s”'
    else 'ha aggiunto il link “%s”' end, new.title));
  return null;
end $$;
