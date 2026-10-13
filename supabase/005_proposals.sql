-- 005: role „navrhovatel harmonogramu“ (proposer), přístup ke skupinám, návrhy změn skupiny
-- Spustit v SQL Editoru po skriptech 001–004.

-- ---------- role proposer ----------
alter table public.project_members drop constraint if exists project_members_role_check;
alter table public.project_members add constraint project_members_role_check check (role in ('lead','editor','viewer','proposer'));
alter table public.project_invites drop constraint if exists project_invites_role_check;
alter table public.project_invites add constraint project_invites_role_check check (role in ('lead','editor','viewer','proposer'));

-- které skupiny navrhovatel vidí; can_edit = smí upravovat návrh skupiny
create table if not exists public.group_access (
  project_id  uuid not null references public.projects(id) on delete cascade,
  group_id    uuid not null references public.task_groups(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  can_edit    boolean not null default true,
  primary key (group_id, user_id)
);

-- ---------- návrhy ----------
create table if not exists public.proposals (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  group_id    uuid not null references public.task_groups(id) on delete cascade,
  status      text not null default 'open' check (status in ('open','approved','rejected')),
  note        text default '',
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  decided_by  uuid references auth.users(id),
  decided_at  timestamptz
);
create unique index if not exists proposals_one_open on public.proposals(group_id) where status = 'open';

create table if not exists public.proposal_tasks (
  id            uuid primary key default gen_random_uuid(),
  proposal_id   uuid not null references public.proposals(id) on delete cascade,
  project_id    uuid not null references public.projects(id) on delete cascade,
  orig_task_id  uuid,                      -- původní úkol (null = nový)
  parent_id     uuid references public.proposal_tasks(id) on delete cascade,
  sort          int not null default 0,
  name          text not null default '',
  start_date    date not null,
  end_date      date not null,
  group_id      uuid references public.task_groups(id) on delete set null,
  color         text default '',
  resp          text default '',
  collab        text[] default '{}',
  critical      boolean default false,
  milestone     boolean default false,
  progress      int default 0,
  collapsed     boolean default false,
  note          text default '',
  deps          uuid[] default '{}',
  unclear       boolean default false,
  question      text default '',
  updated_at    timestamptz default now()
);
create index if not exists proposal_tasks_prop_idx on public.proposal_tasks(proposal_id, sort);

drop trigger if exists touch_proposals on public.proposals;
create trigger touch_proposals before update on public.proposals for each row execute function public.touch_updated_at();
drop trigger if exists touch_proposal_tasks on public.proposal_tasks;
create trigger touch_proposal_tasks before update on public.proposal_tasks for each row execute function public.touch_updated_at();

-- ---------- pomocné funkce ----------
create or replace function public.is_proposer(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.member_role(pid) = 'proposer'
$$;

-- vidí uživatel skupinu? plný člen ano; navrhovatel jen podle group_access
create or replace function public.group_visible(pid uuid, gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.member_role(pid) in ('lead','editor','viewer') then true
    when public.member_role(pid) = 'proposer' then exists (select 1 from public.group_access where group_id = gid and user_id = auth.uid())
    else exists (select 1 from public.projects where id = pid and created_by = auth.uid())
  end
$$;

create or replace function public.group_editable(pid uuid, gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_lead(pid)
      or exists (select 1 from public.group_access where group_id = gid and user_id = auth.uid() and can_edit)
$$;

create or replace function public.proposal_group(prop uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select group_id from public.proposals where id = prop
$$;

-- ---------- RLS ----------
alter table public.group_access   enable row level security;
alter table public.proposals      enable row level security;
alter table public.proposal_tasks enable row level security;

drop policy if exists ga_select on public.group_access;
create policy ga_select on public.group_access for select to authenticated using (public.is_member(project_id));
drop policy if exists ga_write on public.group_access;
create policy ga_write on public.group_access for all to authenticated using (public.is_lead(project_id)) with check (public.is_lead(project_id));

drop policy if exists prop_select on public.proposals;
create policy prop_select on public.proposals for select to authenticated using (public.group_visible(project_id, group_id));
drop policy if exists prop_insert on public.proposals;
create policy prop_insert on public.proposals for insert to authenticated with check (public.group_editable(project_id, group_id) and created_by = auth.uid());
drop policy if exists prop_update on public.proposals;
create policy prop_update on public.proposals for update to authenticated using (public.group_editable(project_id, group_id)) with check (public.group_editable(project_id, group_id));
drop policy if exists prop_delete on public.proposals;
create policy prop_delete on public.proposals for delete to authenticated using (public.is_lead(project_id));

drop policy if exists pt_select on public.proposal_tasks;
create policy pt_select on public.proposal_tasks for select to authenticated using (public.group_visible(project_id, public.proposal_group(proposal_id)));
drop policy if exists pt_write on public.proposal_tasks;
create policy pt_write on public.proposal_tasks for all to authenticated
  using (public.group_editable(project_id, public.proposal_group(proposal_id)))
  with check (public.group_editable(project_id, public.proposal_group(proposal_id)));

-- úkoly: navrhovatel vidí jen úkoly viditelných skupin (a upravovat je nesmí – can_write ho nezahrnuje)
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_member(project_id) and (not public.is_proposer(project_id) or public.group_visible(project_id, group_id)));

-- skupiny: navrhovatel vidí jen své
drop policy if exists groups_select on public.task_groups;
create policy groups_select on public.task_groups for select to authenticated
  using (public.is_member(project_id) and (not public.is_proposer(project_id) or public.group_visible(project_id, id)));

-- deník, odkazy, dokumenty, ToDo úkolů: čtení navrhovatele omezeno na viditelné úkoly (dědí přes tasks_select)
create or replace function public.task_visible(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks t where t.id = tid
                 and public.is_member(t.project_id)
                 and (not public.is_proposer(t.project_id) or public.group_visible(t.project_id, t.group_id)))
$$;
drop policy if exists log_select on public.task_log;
create policy log_select on public.task_log for select to authenticated using (public.task_visible(task_id));
drop policy if exists links_select on public.task_links;
create policy links_select on public.task_links for select to authenticated using (public.task_visible(task_id));
drop policy if exists docs_select on public.documents;
create policy docs_select on public.documents for select to authenticated
  using (public.is_member(project_id) and (task_id is null or public.task_visible(task_id)));
drop policy if exists todos_select on public.todos;
create policy todos_select on public.todos for select to authenticated
  using (owner = auth.uid() or (project_id is not null and public.is_member(project_id) and not public.is_proposer(project_id))
         or (task_id is not null and public.task_visible(task_id)));

do $$ begin
  alter publication supabase_realtime add table public.proposal_tasks;
  alter publication supabase_realtime add table public.proposals;
exception when duplicate_object then null; end $$;
