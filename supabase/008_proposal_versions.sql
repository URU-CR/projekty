-- 008: pojmenované verze (snímky) návrhu
create table if not exists public.proposal_versions (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references public.proposals(id) on delete cascade,
  project_id   uuid not null references public.projects(id) on delete cascade,
  name         text not null default '',
  kind         text not null default 'manual' check (kind in ('manual','initial','approved','auto')),
  author       uuid references auth.users(id),
  created_at   timestamptz default now(),
  snapshot     jsonb not null
);
create index if not exists proposal_versions_prop_idx on public.proposal_versions(proposal_id, created_at);
alter table public.proposal_versions enable row level security;
drop policy if exists pv_select on public.proposal_versions;
create policy pv_select on public.proposal_versions for select to authenticated using (public.group_visible(project_id, public.proposal_group(proposal_id)));
drop policy if exists pv_insert on public.proposal_versions;
create policy pv_insert on public.proposal_versions for insert to authenticated with check (public.group_editable(project_id, public.proposal_group(proposal_id)) and author = auth.uid());
drop policy if exists pv_delete on public.proposal_versions;
create policy pv_delete on public.proposal_versions for delete to authenticated using (public.is_lead(project_id));
