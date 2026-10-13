-- =====================================================================
--  PROJEKTY (Gantt + ToDo) — schéma Supabase
--  Spusťte v Supabase → SQL Editor → New query → Run. Skript je idempotentní.
--  Role v projektu:  lead   = vedoucí projektu (vše)
--                    editor = řešitel (upravuje své úkoly, deník, odkazy, ToDo)
--                    viewer = čtenář
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- uživatelé ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  name        text,
  created_at  timestamptz default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do update set email = excluded.email;
  -- převod pozvánek podle e-mailu na členství
  insert into public.project_members (project_id, user_id, role)
  select i.project_id, new.id, i.role from public.project_invites i where lower(i.email) = lower(new.email)
  on conflict do nothing;
  delete from public.project_invites where lower(email) = lower(new.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- projekty ----------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  lead_name   text default '',
  color       text default '#2196f3',
  archived    boolean default false,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists public.project_members (
  project_id  uuid references public.projects(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,
  role        text not null check (role in ('lead','editor','viewer')) default 'editor',
  created_at  timestamptz default now(),
  primary key (project_id, user_id)
);

create table if not exists public.project_invites (
  project_id  uuid references public.projects(id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('lead','editor','viewer')) default 'editor',
  created_at  timestamptz default now(),
  primary key (project_id, email)
);

-- tým projektu = jména, která se přiřazují k úkolům (mohou, ale nemusí být uživateli)
create table if not exists public.project_team (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects(id) on delete cascade,
  name        text not null,
  user_id     uuid references auth.users(id) on delete set null,
  sort        int default 0,
  unique (project_id, name)
);

create table if not exists public.task_groups (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects(id) on delete cascade,
  name        text not null,
  color       text not null default '#2196f3',
  sort        int default 0
);

-- ---------- úkoly ----------
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  parent_id   uuid references public.tasks(id) on delete cascade,
  sort        int not null default 0,
  name        text not null default '',
  start_date  date not null,
  end_date    date not null,
  group_id    uuid references public.task_groups(id) on delete set null,
  color       text default '',
  resp        text default '',
  collab      text[] default '{}',
  critical    boolean default false,
  milestone   boolean default false,
  progress    int default 0 check (progress between 0 and 100),
  auto_prog   boolean default false,
  collapsed   boolean default false,
  note        text default '',
  deps        uuid[] default '{}',
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists tasks_project_idx on public.tasks(project_id, sort);

create table if not exists public.task_links (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  name        text default '',
  url         text default '',
  sort        int default 0
);

create table if not exists public.task_log (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  d           date not null default current_date,
  text        text not null,
  author      uuid references auth.users(id),
  created_at  timestamptz default now()
);

create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid references public.tasks(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null,
  path        text not null,           -- cesta v bucketu task-files: <project_id>/<task_id|inbox>/<uuid>-<název>
  size        bigint,
  mime        text,
  uploaded_by uuid references auth.users(id),
  created_at  timestamptz default now()
);

-- ---------- ToDo ----------
-- project_id + task_id null  => osobní inbox uživatele (owner)
-- project_id, task_id null   => inbox projektu
-- task_id vyplněn            => checklist úkolu
create table if not exists public.todos (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references auth.users(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,
  task_id     uuid references public.tasks(id) on delete cascade,
  text        text not null default '',
  who         text default '',
  done        boolean default false,
  done_at     date,
  due         date,
  block       boolean default false,
  pri         int default 2 check (pri between 1 and 3),
  imp         boolean default false,
  sort        int default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists todos_owner_idx on public.todos(owner, done);
create index if not exists todos_task_idx  on public.todos(task_id);

-- ---------- updated_at ----------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['projects','tasks','todos'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop; end $$;

-- zakladatel projektu se stane vedoucím
create or replace function public.add_creator_as_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, user_id, role) values (new.id, coalesce(new.created_by, auth.uid()), 'lead')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_project_created on public.projects;
create trigger on_project_created after insert on public.projects
  for each row execute function public.add_creator_as_lead();

-- =====================================================================
--  Pomocné funkce pro RLS
-- =====================================================================
create or replace function public.member_role(pid uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.project_members where project_id = pid and user_id = auth.uid()
$$;

create or replace function public.is_member(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members where project_id = pid and user_id = auth.uid())
$$;

create or replace function public.is_lead(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.member_role(pid) = 'lead'
$$;

create or replace function public.can_write(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.member_role(pid) in ('lead','editor')
$$;

-- jména v týmu projektu, která patří přihlášenému uživateli
create or replace function public.my_team_names(pid uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(name), '{}') from public.project_team where project_id = pid and user_id = auth.uid()
$$;

-- řešitel smí upravit úkol, kde je odpovědný nebo spolupracovník; vedoucí cokoli
create or replace function public.can_edit_task(pid uuid, resp text, collab text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_lead(pid)
      or (public.member_role(pid) = 'editor'
          and (resp = any(public.my_team_names(pid)) or collab && public.my_team_names(pid)))
$$;

-- =====================================================================
--  RLS
-- =====================================================================
alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;
alter table public.project_team    enable row level security;
alter table public.task_groups     enable row level security;
alter table public.tasks           enable row level security;
alter table public.task_links      enable row level security;
alter table public.task_log        enable row level security;
alter table public.documents       enable row level security;
alter table public.todos           enable row level security;

-- profily: každý přihlášený vidí profily (kvůli jménům), upravuje jen svůj
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid());

-- projekty
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated using (public.is_member(id));
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated with check (created_by = auth.uid());
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated using (public.is_lead(id));
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated using (public.is_lead(id));

-- členové a pozvánky: vidí členové, spravuje vedoucí
drop policy if exists members_select on public.project_members;
create policy members_select on public.project_members for select to authenticated using (public.is_member(project_id));
drop policy if exists members_write on public.project_members;
create policy members_write on public.project_members for all to authenticated using (public.is_lead(project_id)) with check (public.is_lead(project_id));
drop policy if exists invites_all on public.project_invites;
create policy invites_all on public.project_invites for all to authenticated using (public.is_lead(project_id)) with check (public.is_lead(project_id));

-- tým a skupiny: čtou členové, píše vedoucí (řešitel může přidat jméno do týmu kvůli ToDo)
drop policy if exists team_select on public.project_team;
create policy team_select on public.project_team for select to authenticated using (public.is_member(project_id));
drop policy if exists team_insert on public.project_team;
create policy team_insert on public.project_team for insert to authenticated with check (public.can_write(project_id));
drop policy if exists team_modify on public.project_team;
create policy team_modify on public.project_team for update to authenticated using (public.is_lead(project_id));
drop policy if exists team_delete on public.project_team;
create policy team_delete on public.project_team for delete to authenticated using (public.is_lead(project_id));

drop policy if exists groups_select on public.task_groups;
create policy groups_select on public.task_groups for select to authenticated using (public.is_member(project_id));
drop policy if exists groups_write on public.task_groups;
create policy groups_write on public.task_groups for all to authenticated using (public.is_lead(project_id)) with check (public.is_lead(project_id));

-- úkoly: čtou členové; vkládá vedoucí (řešitel může vložit úkol, kde je sám odpovědný);
-- upravuje vedoucí, nebo řešitel své úkoly; maže vedoucí
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated using (public.is_member(project_id));
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_lead(project_id) or (public.can_write(project_id) and resp = any(public.my_team_names(project_id))));
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_edit_task(project_id, resp, collab)) with check (public.can_edit_task(project_id, resp, collab));
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated using (public.is_lead(project_id));

-- odkazy, deník, dokumenty: čtou členové, píší vedoucí i řešitelé (deník: vlastní záznam maže autor nebo vedoucí)
create or replace function public.task_project(tid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select project_id from public.tasks where id = tid
$$;

drop policy if exists links_select on public.task_links;
create policy links_select on public.task_links for select to authenticated using (public.is_member(public.task_project(task_id)));
drop policy if exists links_write on public.task_links;
create policy links_write on public.task_links for all to authenticated
  using (public.can_write(public.task_project(task_id))) with check (public.can_write(public.task_project(task_id)));

drop policy if exists log_select on public.task_log;
create policy log_select on public.task_log for select to authenticated using (public.is_member(public.task_project(task_id)));
drop policy if exists log_insert on public.task_log;
create policy log_insert on public.task_log for insert to authenticated
  with check (public.can_write(public.task_project(task_id)) and author = auth.uid());
drop policy if exists log_delete on public.task_log;
create policy log_delete on public.task_log for delete to authenticated
  using (author = auth.uid() or public.is_lead(public.task_project(task_id)));

drop policy if exists docs_select on public.documents;
create policy docs_select on public.documents for select to authenticated using (public.is_member(project_id));
drop policy if exists docs_insert on public.documents;
create policy docs_insert on public.documents for insert to authenticated
  with check (public.can_write(project_id) and uploaded_by = auth.uid());
drop policy if exists docs_delete on public.documents;
create policy docs_delete on public.documents for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_lead(project_id));

-- ToDo: osobní vidí jen vlastník; projektové vidí členové; upravuje vlastník, vedoucí, nebo řešitel projektu
drop policy if exists todos_select on public.todos;
create policy todos_select on public.todos for select to authenticated
  using (owner = auth.uid() or (project_id is not null and public.is_member(project_id)));
drop policy if exists todos_insert on public.todos;
create policy todos_insert on public.todos for insert to authenticated
  with check (owner = auth.uid() and (project_id is null or public.can_write(project_id)));
drop policy if exists todos_update on public.todos;
create policy todos_update on public.todos for update to authenticated
  using (owner = auth.uid() or (project_id is not null and public.can_write(project_id)));
drop policy if exists todos_delete on public.todos;
create policy todos_delete on public.todos for delete to authenticated
  using (owner = auth.uid() or (project_id is not null and public.is_lead(project_id)));

-- =====================================================================
--  Storage: bucket task-files (soukromý), cesta <project_id>/...
-- =====================================================================
insert into storage.buckets (id, name, public) values ('task-files','task-files', false)
on conflict (id) do nothing;

drop policy if exists "task-files read"   on storage.objects;
create policy "task-files read" on storage.objects for select to authenticated
  using (bucket_id = 'task-files' and public.is_member((storage.foldername(name))[1]::uuid));
drop policy if exists "task-files insert" on storage.objects;
create policy "task-files insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files' and public.can_write((storage.foldername(name))[1]::uuid));
drop policy if exists "task-files delete" on storage.objects;
create policy "task-files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'task-files' and (owner = auth.uid() or public.is_lead((storage.foldername(name))[1]::uuid)));

-- =====================================================================
--  Realtime (volitelné) – aby se změny kolegů promítly bez obnovení stránky
-- =====================================================================
do $$ begin
  alter publication supabase_realtime add table public.tasks;
  alter publication supabase_realtime add table public.todos;
  alter publication supabase_realtime add table public.task_log;
exception when duplicate_object then null; end $$;
