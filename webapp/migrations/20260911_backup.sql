-- Run before the workspace migration. This retains the existing records and
-- definitions privately inside PostgreSQL; it is not a substitute for PITR.
begin;
create schema if not exists wildpass_release_backup;
revoke all on schema wildpass_release_backup from public, anon, authenticated;
create table if not exists wildpass_release_backup.snapshots (
 release text primary key, recorded_at timestamptz not null default now(), payload jsonb not null
);
alter table wildpass_release_backup.snapshots enable row level security;
revoke all on all tables in schema wildpass_release_backup from public, anon, authenticated;
insert into wildpass_release_backup.snapshots(release,payload)
select '20260911_workspace', jsonb_build_object(
 'projects', (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.projects t),
 'organizations', (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.organizations t),
 'profiles', (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.profiles t),
 'species', (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.species t),
 'documents', (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.documents t),
 'comments', (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.comments t),
 'policies', (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from pg_policies t where schemaname in ('public','storage')),
 'grants', (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from information_schema.role_table_grants t where table_schema='public'),
 'functions', (select coalesce(jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid))),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('handle_new_user','my_org','set_updated_at'))
) on conflict(release) do nothing;
commit;
