-- 016: kompletní znovunasazení omezení na skupiny (funkce z 011 kromě has_group_scope, která je z 013, + politiky). Idempotentní.
-- je uživatel omezen na skupiny? (navrhovatel vždy; řešitel/čtenář jen pokud má scope)
create or replace function public.is_scoped(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.member_role(pid) = 'proposer'
      or (public.member_role(pid) in ('editor','viewer') and public.has_group_scope(pid))
$$;

create or replace function public.group_visible(pid uuid, gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.is_lead(pid) then true
    when public.is_scoped(pid) then exists (select 1 from public.group_access where group_id = gid and user_id = auth.uid())
    when public.member_role(pid) in ('editor','viewer') then true
    else false
  end
$$;

-- smí řešitel v této skupině zapisovat? (bez scope ano; se scope jen can_edit)
create or replace function public.group_writable(pid uuid, gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.is_lead(pid) then true
    when public.member_role(pid) = 'editor' and not public.has_group_scope(pid) then true
    when public.member_role(pid) = 'editor' then exists (select 1 from public.group_access where group_id = gid and user_id = auth.uid() and can_edit)
    else false
  end
$$;

-- úkol: řešitel upravuje své úkoly, a jen ve skupině, kde smí zapisovat
create or replace function public.can_edit_task(pid uuid, resp text, collab text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_lead(pid)
      or (public.member_role(pid) = 'editor'
          and (resp = any(public.my_team_names(pid)) or collab && public.my_team_names(pid)))
$$;
create or replace function public.can_edit_task_g(pid uuid, gid uuid, resp text, collab text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_edit_task(pid, resp, collab) and public.group_writable(pid, gid)
$$;

create or replace function public.task_visible(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks t where t.id = tid
                 and public.is_member(t.project_id)
                 and public.group_visible(t.project_id, t.group_id))
$$;
create or replace function public.task_writable(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks t where t.id = tid
                 and public.can_write(t.project_id) and public.group_writable(t.project_id, t.group_id))
$$;


-- ---------- politiky ----------
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_member(project_id) and public.group_visible(project_id, group_id));
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.can_edit_task_g(project_id, group_id, resp, collab));
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_edit_task_g(project_id, group_id, resp, collab)) with check (public.can_edit_task_g(project_id, group_id, resp, collab));

drop policy if exists groups_select on public.task_groups;
create policy groups_select on public.task_groups for select to authenticated
  using (public.is_member(project_id) and public.group_visible(project_id, id));

drop policy if exists links_write on public.task_links;
create policy links_write on public.task_links for all to authenticated
  using (public.task_writable(task_id)) with check (public.task_writable(task_id));
drop policy if exists log_insert on public.task_log;
create policy log_insert on public.task_log for insert to authenticated
  with check (public.task_writable(task_id));
drop policy if exists docs_insert on public.documents;
create policy docs_insert on public.documents for insert to authenticated
  with check (public.can_write(project_id) and (task_id is null or public.task_writable(task_id)));

drop policy if exists todos_select on public.todos;
create policy todos_select on public.todos for select to authenticated
  using (owner = auth.uid()
         or (project_id is not null and task_id is null and public.is_member(project_id) and not public.is_scoped(project_id))
         or (task_id is not null and public.task_visible(task_id)));
drop policy if exists todos_insert on public.todos;
create policy todos_insert on public.todos for insert to authenticated
  with check ((project_id is null and task_id is null and (owner is null or owner = auth.uid()))
              or (project_id is not null and task_id is null and public.can_write(project_id) and not public.is_scoped(project_id))
              or (task_id is not null and public.task_writable(task_id)));
drop policy if exists todos_update on public.todos;
create policy todos_update on public.todos for update to authenticated
  using (owner = auth.uid() or (task_id is not null and public.task_writable(task_id))
         or (project_id is not null and task_id is null and public.can_write(project_id) and not public.is_scoped(project_id)));

drop policy if exists "task-files insert" on storage.objects;
create policy "task-files insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files' and public.can_write((storage.foldername(name))[1]::uuid)
              and ((storage.foldername(name))[2] = 'inbox' or public.task_writable((storage.foldername(name))[2]::uuid)));

-- kontrola: má vrátit řádek s group_visible
select policyname, qual from pg_policies where tablename='tasks' and cmd='SELECT';
