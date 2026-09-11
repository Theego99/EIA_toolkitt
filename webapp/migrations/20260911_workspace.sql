-- Wildpass release workspace. Additive migration; existing project content is retained.
-- Apply inside one transaction. Re-run is safe. Export a database backup before rollout.
begin;
alter table public.projects add column if not exists version bigint not null default 0;
alter table public.projects add column if not exists workspace jsonb not null default '{}'::jsonb;
alter table public.projects add column if not exists species_data jsonb not null default '[]'::jsonb;
alter table public.projects add column if not exists documents jsonb not null default '[]'::jsonb;
alter table public.projects add column if not exists comments jsonb not null default '[]'::jsonb;
alter table public.projects add column if not exists activity jsonb not null default '[]'::jsonb;
alter table public.projects add column if not exists custom_stages jsonb;
alter table public.projects add column if not exists project_class text;
alter table public.projects add column if not exists juran_dates jsonb not null default '{}'::jsonb;
create index if not exists projects_org_updated_idx on public.projects(organization_id, updated_at desc);
alter table public.profiles add column if not exists suspended_at timestamptz;

create or replace function public.my_org() returns uuid language sql stable security definer set search_path = '' as $$
 select organization_id from public.profiles where id = auth.uid() and suspended_at is null limit 1;
$$;
create or replace function public.workspace_role() returns text language sql stable security definer set search_path = '' as $$
 select role from public.profiles where id = auth.uid() and suspended_at is null limit 1;
$$;
revoke all on function public.my_org(), public.workspace_role() from public;
grant execute on function public.my_org(), public.workspace_role() to authenticated;

create table if not exists public.workspace_audit (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 project_id uuid not null, actor_id uuid, actor_name text, action text not null,
 version bigint not null, recorded_at timestamptz not null default now(), snapshot jsonb not null
);
create index if not exists workspace_audit_project_idx on public.workspace_audit(project_id, recorded_at desc);
alter table public.workspace_audit enable row level security;
drop policy if exists workspace_audit_read on public.workspace_audit;
create policy workspace_audit_read on public.workspace_audit for select to authenticated using (organization_id = public.my_org());
revoke all on public.workspace_audit from anon, authenticated;
grant select on public.workspace_audit to authenticated;

-- Remove permissive legacy policies: PostgreSQL ORs policies of the same command.
do $$ declare p record; begin
 for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' and tablename in ('projects','profiles','organizations','species','documents','comments') loop
  execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
 end loop;
end $$;
alter table public.projects enable row level security;
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
create policy workspace_projects_read on public.projects for select to authenticated using (organization_id = public.my_org());
create policy workspace_profiles_read on public.profiles for select to authenticated using (organization_id = public.my_org());
create policy workspace_org_read on public.organizations for select to authenticated using (id = public.my_org());
create policy workspace_profile_name on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke all on public.projects, public.profiles, public.organizations from anon, authenticated;
grant select on public.projects, public.profiles, public.organizations to authenticated;
grant update(name) on public.profiles to authenticated;
-- Retain read access to historical normalized child records; new writes use the audited workspace RPC.
do $$ declare t text; begin
 foreach t in array array['species','documents','comments'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from anon, authenticated', t);
  execute format('grant select on public.%I to authenticated', t);
  execute format('create policy workspace_legacy_read on public.%I for select to authenticated using (project_id in (select id from public.projects where organization_id = public.my_org()))', t);
 end loop;
end $$;

create or replace function public.save_workspace_project(p_row jsonb, p_expected bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 v_user uuid := auth.uid(); v_org uuid := public.my_org(); v_role text := public.workspace_role();
 v_id uuid := (p_row->>'id')::uuid; old_row public.projects; result public.projects;
 stage_tasks jsonb; task jsonb; previous jsonb; evidence jsonb; old_evidence jsonb;
 old_sources jsonb; new_sources jsonb;
begin
 if v_user is null or v_org is null or v_role not in ('admin','pm','surveyor','author','reviewer') then raise exception '編集権限がありません' using errcode = '42501'; end if;
 if (p_row->>'organization_id')::uuid is distinct from v_org then raise exception '組織が一致しません' using errcode = '42501'; end if;
 if coalesce(length(trim(p_row->>'name')),0) < 1 or length(p_row->>'name') > 300 then raise exception 'プロジェクト名を確認してください'; end if;
 if octet_length(p_row::text) > 15000000 then raise exception 'プロジェクトデータが上限を超えています。画像は添付として保存してください'; end if;
 -- Serializes creation and updates, including first-write races on a shared offline project id.
 perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
 select * into old_row from public.projects where id = v_id for update;
 if found then
  if old_row.organization_id <> v_org then raise exception 'プロジェクトにアクセスできません' using errcode = '42501'; end if;
  if old_row.version <> p_expected then raise exception '競合: 最新の変更を取得してください' using errcode = '40001'; end if;
 elsif p_expected <> 0 then raise exception 'プロジェクトが存在しません' using errcode = '40001';
 end if;
 if jsonb_typeof(p_row->'tasks') is distinct from 'object' then raise exception '業務データが無効です'; end if;
 -- New evidence must already exist in this project's private namespace. Existing
 -- content identities are immutable; corrected evidence is a new retained record.
 for evidence in select value from jsonb_array_elements(coalesce(p_row->'documents','[]') || coalesce(p_row#>'{workspace,reports}','[]')) loop
  select value into old_evidence from jsonb_array_elements(coalesce(old_row.documents,'[]') || coalesce(old_row.workspace->'reports','[]')) where value->>'id'=evidence->>'id' limit 1;
  if old_evidence is not null and old_evidence->>'sha256' is not null then
   if (evidence->>'sha256',evidence->>'storage_path',evidence->>'size',evidence->>'name') is distinct from (old_evidence->>'sha256',old_evidence->>'storage_path',old_evidence->>'size',old_evidence->>'name') then raise exception '原本の識別情報は変更できません。新しい資料として追加してください'; end if;
  elsif evidence->>'storage_path' is not null then
   if coalesce(evidence->>'sha256','') !~ '^[0-9a-f]{64}$' or split_part(evidence->>'storage_path','/',1) <> v_org::text or split_part(evidence->>'storage_path','/',2) <> v_id::text or split_part(evidence->>'storage_path','/',3) is distinct from evidence->>'id' then raise exception '原本の保存先・検証情報が無効です'; end if;
   if not exists(select 1 from storage.objects where bucket_id='workspace-evidence' and name=evidence->>'storage_path') then raise exception '原本のアップロードが完了していません'; end if;
  end if;
 end loop;
 for old_evidence in select value from jsonb_array_elements(coalesce(old_row.documents,'[]') || coalesce(old_row.workspace->'reports','[]')) loop
  if not exists(select 1 from jsonb_array_elements(coalesce(p_row->'documents','[]') || coalesce(p_row#>'{workspace,reports}','[]')) where value->>'id'=old_evidence->>'id') then raise exception '既存の資料・報告書の履歴は削除できません'; end if;
 end loop;
 for stage_tasks in select value from jsonb_each(p_row->'tasks') loop
  if jsonb_typeof(stage_tasks) <> 'array' then raise exception '業務データが無効です'; end if;
  for task in select value from jsonb_array_elements(stage_tasks) loop
   select t into previous from jsonb_each(coalesce(old_row.tasks, '{}'::jsonb)) s,
     lateral jsonb_array_elements(s.value) t where t->>'id' = task->>'id' limit 1;
   if task->>'status' in ('review','approved') then
    if previous->>'status' in ('review','approved') then
     select coalesce(jsonb_agg(value - 'pending' order by value->>'id'),'[]') into old_sources from jsonb_array_elements(coalesce(old_row.documents,'[]') || coalesce(old_row.species_data,'[]') || coalesce(old_row.workspace->'measurements','[]')) where value->>'taskId'=task->>'id';
     select coalesce(jsonb_agg(value - 'pending' order by value->>'id'),'[]') into new_sources from jsonb_array_elements(coalesce(p_row->'documents','[]') || coalesce(p_row->'species_data','[]') || coalesce(p_row#>'{workspace,measurements}','[]')) where value->>'taskId'=task->>'id';
     if old_sources is distinct from new_sources then raise exception '根拠記録が変更されています。業務を作業中に戻して再提出してください'; end if;
    end if;
    if task->>'status'='review' and task is distinct from previous then
     if coalesce(length(trim(task->>'note')),0)=0 or task->>'submittedBy' is distinct from v_user::text then raise exception '記録者の結果と照査提出情報を確認してください'; end if;
    end if;
   end if;
   if task->>'status' = 'approved' and task is distinct from previous then
    if v_role not in ('admin','pm','reviewer') then raise exception '照査権限がありません' using errcode = '42501'; end if;
    if coalesce(task->>'submittedBy', '') = '' or task->>'submittedBy' = v_user::text then raise exception '提出者以外の担当者が照査してください'; end if;
    if length(trim(coalesce(task#>>'{review,reason}', ''))) = 0 then raise exception '照査理由が必要です'; end if;
    if task#>>'{review,by,id}' is distinct from v_user::text then raise exception '照査者が一致しません'; end if;
    if previous->>'status' is distinct from 'review' or task->>'submittedBy' is distinct from previous->>'submittedBy' then raise exception '共有済みの照査提出に対して承認してください'; end if;
    if (task - 'status' - 'done' - 'review') is distinct from (previous - 'status' - 'done' - 'review') then raise exception '提出後に内容が変更されています。再提出してください'; end if;
   end if;
  end loop;
 end loop;
 if old_row.id is null then
  insert into public.projects(id, organization_id, name) values(v_id, v_org, p_row->>'name');
 end if;
 update public.projects set
 name = p_row->>'name', client = p_row->>'client', type = p_row->>'type', pref = p_row->>'pref',
 deadline = nullif(p_row->>'deadline','')::date, description = coalesce(p_row->>'description', p_row->>'desc', ''),
 stage = least(7, greatest(1, coalesce((p_row->>'stage')::integer, 1))), manager = p_row->>'manager',
 area = p_row->>'area', budget = p_row->>'budget',
 tasks = p_row->'tasks', species_data = coalesce(p_row->'species_data','[]'), documents = coalesce(p_row->'documents','[]'),
 comments = coalesce(p_row->'comments','[]'), activity = coalesce(p_row->'activity','[]'),
 workspace = coalesce(p_row->'workspace','{}'),
 version = coalesce(old_row.version,0) + 1, updated_at = now()
 where id = v_id returning * into result;
 insert into public.workspace_audit(organization_id, project_id, actor_id, actor_name, action, version, snapshot)
 values(v_org, v_id, v_user, (select name from public.profiles where id = v_user), case when old_row.id is null then 'created' else 'updated' end, result.version, to_jsonb(result));
 return to_jsonb(result);
end $$;
revoke all on function public.save_workspace_project(jsonb,bigint) from public;
grant execute on function public.save_workspace_project(jsonb,bigint) to authenticated;

create table if not exists public.workspace_invitations (
 email text primary key, organization_id uuid not null references public.organizations(id),
 role text not null check(role in ('pm','surveyor','author','reviewer','client')),
 invited_by uuid not null, expires_at timestamptz not null default now() + interval '7 days', accepted_at timestamptz
);
alter table public.workspace_invitations enable row level security;
drop policy if exists workspace_invites_admin on public.workspace_invitations;
create policy workspace_invites_admin on public.workspace_invitations for select to authenticated using (organization_id = public.my_org() and public.workspace_role() = 'admin');
revoke all on public.workspace_invitations from anon, authenticated;
grant select on public.workspace_invitations to authenticated;
create or replace function public.invite_workspace_member(p_email text, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if public.workspace_role() is distinct from 'admin' or auth.uid() is null then raise exception '管理者権限が必要です' using errcode = '42501'; end if;
 if p_role not in ('pm','surveyor','author','reviewer','client') or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'メールアドレスと権限を確認してください'; end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_email)), 1));
 if exists(select 1 from auth.users where lower(email) = lower(trim(p_email))) then raise exception '登録済みのユーザーです。組織変更は管理窓口で確認してください'; end if;
 if exists(select 1 from public.workspace_invitations where email = lower(trim(p_email)) and organization_id <> public.my_org() and expires_at > now()) then raise exception '招待できません。管理窓口に確認してください'; end if;
 insert into public.workspace_invitations(email,organization_id,role,invited_by)
 values(lower(trim(p_email)),public.my_org(),p_role,auth.uid())
 on conflict(email) do update set organization_id=excluded.organization_id,role=excluded.role,invited_by=excluded.invited_by,expires_at=now()+interval '7 days',accepted_at=null;
end $$;
revoke all on function public.invite_workspace_member(text,text) from public;
grant execute on function public.invite_workspace_member(text,text) to authenticated;

create table if not exists public.workspace_access_audit (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 actor_id uuid not null, member_id uuid not null, recorded_at timestamptz not null default now(), before_value jsonb, after_value jsonb
);
alter table public.workspace_access_audit enable row level security;
revoke all on public.workspace_access_audit from anon, authenticated;
grant select on public.workspace_access_audit to authenticated;
drop policy if exists workspace_access_read on public.workspace_access_audit;
create policy workspace_access_read on public.workspace_access_audit for select to authenticated using(organization_id=public.my_org() and public.workspace_role()='admin');
create or replace function public.manage_workspace_member(p_member uuid,p_role text,p_suspended boolean) returns void language plpgsql security definer set search_path='' as $$
declare before_profile public.profiles; after_profile public.profiles;
begin
 if public.workspace_role() is distinct from 'admin' or auth.uid() is null then raise exception '管理者権限が必要です' using errcode='42501'; end if;
 if p_role not in ('admin','pm','surveyor','author','reviewer','client') or p_suspended is null then raise exception '権限・利用状態を確認してください'; end if;
 if p_member=auth.uid() then raise exception '自分自身の権限・利用状態は変更できません'; end if;
 perform pg_advisory_xact_lock(hashtextextended(public.my_org()::text,2));
 select * into before_profile from public.profiles where id=p_member and organization_id=public.my_org() for update;
 if not found then raise exception '組織のメンバーが見つかりません'; end if;
 update public.profiles set role=p_role,suspended_at=case when p_suspended then coalesce(suspended_at,now()) else null end where id=p_member returning * into after_profile;
 insert into public.workspace_access_audit(organization_id,actor_id,member_id,before_value,after_value) values(public.my_org(),auth.uid(),p_member,to_jsonb(before_profile),to_jsonb(after_profile));
end $$;
revoke all on function public.manage_workspace_member(uuid,text,boolean) from public;
grant execute on function public.manage_workspace_member(uuid,text,boolean) to authenticated;

-- Never trust self-supplied role or organization metadata during signup.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare invite public.workspace_invitations; v_org uuid; v_role text;
begin
 select * into invite from public.workspace_invitations where email=lower(new.email) and accepted_at is null and expires_at>now() for update;
 if found then
  v_org:=invite.organization_id; v_role:=invite.role;
  update public.workspace_invitations set accepted_at=now() where email=invite.email;
 else
  insert into public.organizations(name,plan) values(coalesce(nullif(new.raw_user_meta_data->>'company',''), '新しい組織'),'starter') returning id into v_org;
  v_role:='admin';
 end if;
 insert into public.profiles(id,organization_id,name,role) values(new.id,v_org,coalesce(new.raw_user_meta_data->>'name',new.email),v_role) on conflict(id) do nothing;
 return new;
end $$;

-- Private immutable evidence. Paths start with organization id; no public URLs.
insert into storage.buckets(id,name,public,file_size_limit) values('workspace-evidence','workspace-evidence',false,52428800)
on conflict(id) do update set public=false,file_size_limit=52428800;
drop policy if exists workspace_evidence_read on storage.objects;
drop policy if exists workspace_evidence_insert on storage.objects;
create policy workspace_evidence_read on storage.objects for select to authenticated
 using (bucket_id='workspace-evidence' and (storage.foldername(name))[1]=public.my_org()::text);
create policy workspace_evidence_insert on storage.objects for insert to authenticated
 with check(bucket_id='workspace-evidence' and (storage.foldername(name))[1]=public.my_org()::text and public.workspace_role() in ('admin','pm','surveyor','author','reviewer'));
-- Restrictive policies also constrain legacy broad storage policies for this bucket.
drop policy if exists workspace_evidence_tenant_guard on storage.objects;
create policy workspace_evidence_tenant_guard on storage.objects as restrictive for all to authenticated
 using (bucket_id<>'workspace-evidence' or (storage.foldername(name))[1]=public.my_org()::text)
 with check (bucket_id<>'workspace-evidence' or ((storage.foldername(name))[1]=public.my_org()::text and public.workspace_role() in ('admin','pm','surveyor','author','reviewer')));
drop policy if exists workspace_evidence_no_update on storage.objects;
create policy workspace_evidence_no_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'workspace-evidence');
drop policy if exists workspace_evidence_no_delete on storage.objects;
create policy workspace_evidence_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'workspace-evidence');
commit;
