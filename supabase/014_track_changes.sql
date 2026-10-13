-- 014: sledování změn (historie úkolů + „nepřečtené“ změny per uživatel)
-- Změny zapisují databázové triggery, takže se zachytí i úpravy mimo aplikaci.

create table if not exists public.task_changes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  task_id     uuid not null,                       -- bez FK: změna přežije smazání úkolu
  task_name   text default '',
  kind        text not null,                       -- 'task' | 'new' | 'deleted' | 'log' | 'doc' | 'todo'
  field       text default '',                     -- u kind='task': name|start|end|resp|progress|critical|milestone|unclear|group|note
  old_value   text,
  new_value   text,
  author      uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);
create index if not exists task_changes_proj_idx on public.task_changes(project_id, created_at desc);
create index if not exists task_changes_task_idx on public.task_changes(task_id, created_at desc);

-- kdo si co vzal na vědomí
create table if not exists public.change_reads (
  change_id   uuid not null references public.task_changes(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  read_at     timestamptz default now(),
  primary key (change_id, user_id)
);

-- volba „Sledování změn“ per uživatel (default zapnuto)
alter table public.profiles add column if not exists track_changes boolean not null default true;

-- ---------- triggery ----------
create or replace function public.log_task_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare f text; o text; n text; chg boolean := false;
begin
  if tg_op = 'INSERT' then
    insert into public.task_changes(project_id, task_id, task_name, kind, author) values (new.project_id, new.id, new.name, 'new', auth.uid());
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.task_changes(project_id, task_id, task_name, kind, author) values (old.project_id, old.id, old.name, 'deleted', auth.uid());
    return old;
  end if;
  -- UPDATE: po sloupcích
  if new.name is distinct from old.name then insert into public.task_changes(project_id,task_id,task_name,kind,field,old_value,new_value,author) values (new.project_id,new.id,new.name,'task','name',old.name,new.name,auth.uid()); end if;
  if new.start_date is distinct from old.start_date then insert into public.task_changes(project_id,task_id,task_name,kind,field,old_value,new_value,author) values (new.project_id,new.id,new.name,'task','start',old.start_date::text,new.start_date::text,auth.uid()); end if;
  if new.end_date is distinct from old.end_date then insert into public.task_changes(project_id,task_id,task_name,kind,field,old_value,new_value,author) values (new.project_id,new.id,new.name,'task','end',old.end_date::text,new.end_date::text,auth.uid()); end if;
  if new.resp is distinct from old.resp then insert into public.task_changes(project_id,task_id,task_name,kind,field,old_value,new_value,author) values (new.project_id,new.id,new.name,'task','resp',old.resp,new.resp,auth.uid()); end if;
  if new.progress is distinct from old.progress then insert into public.task_changes(project_id,task_id,task_name,kind,field,old_value,new_value,author) values (new.project_id,new.id,new.name,'task','progress',old.progress::text,new.progress::text,auth.uid()); end if;
  if new.critical is distinct from old.critical then insert into public.task_changes(project_id,task_id,task_name,kind,field,old_value,new_value,author) values (new.project_id,new.id,new.name,'task','critical',old.critical::text,new.critical::text,auth.uid()); end if;
  if new.milestone is distinct from old.milestone then insert into public.task_changes(project_id,task_id,task_name,kind,field,old_value,new_value,author) values (new.project_id,new.id,new.name,'task','milestone',old.milestone::text,new.milestone::text,auth.uid()); end if;
  if new.unclear is distinct from old.unclear then insert into public.task_changes(project_id,task_id,task_name,kind,field,old_value,new_value,author) values (new.project_id,new.id,new.name,'task','unclear',old.unclear::text,new.unclear::text,auth.uid()); end if;
  if new.group_id is distinct from old.group_id then insert into public.task_changes(project_id,task_id,task_name,kind,field,old_value,new_value,author) values (new.project_id,new.id,new.name,'task','group',(select name from public.task_groups where id=old.group_id),(select name from public.task_groups where id=new.group_id),auth.uid()); end if;
  if new.note is distinct from old.note then insert into public.task_changes(project_id,task_id,task_name,kind,field,old_value,new_value,author) values (new.project_id,new.id,new.name,'task','note',left(old.note,200),left(new.note,200),auth.uid()); end if;
  if new.parent_id is distinct from old.parent_id then insert into public.task_changes(project_id,task_id,task_name,kind,field,old_value,new_value,author) values (new.project_id,new.id,new.name,'task','parent',(select name from public.tasks where id=old.parent_id),(select name from public.tasks where id=new.parent_id),auth.uid()); end if;
  return new;
end $$;
drop trigger if exists track_tasks on public.tasks;
create trigger track_tasks after insert or update or delete on public.tasks for each row execute function public.log_task_change();

create or replace function public.log_tasklog_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.task_changes(project_id, task_id, task_name, kind, new_value, author)
  select t.project_id, t.id, t.name, 'log', left(new.text, 200), coalesce(new.author, auth.uid()) from public.tasks t where t.id = new.task_id;
  return new;
end $$;
drop trigger if exists track_task_log on public.task_log;
create trigger track_task_log after insert on public.task_log for each row execute function public.log_tasklog_change();

create or replace function public.log_doc_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.task_id is null then return new; end if;
  insert into public.task_changes(project_id, task_id, task_name, kind, new_value, author)
  select t.project_id, t.id, t.name, 'doc', new.name, coalesce(new.uploaded_by, auth.uid()) from public.tasks t where t.id = new.task_id;
  return new;
end $$;
drop trigger if exists track_documents on public.documents;
create trigger track_documents after insert on public.documents for each row execute function public.log_doc_change();

-- checklist: splnění blokující položky, přidání/odebrání položky
create or replace function public.log_todo_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.task_id is null then return new; end if;
    insert into public.task_changes(project_id, task_id, task_name, kind, field, new_value, author)
    select t.project_id, t.id, t.name, 'todo', 'add', new.text, auth.uid() from public.tasks t where t.id = new.task_id;
  elsif tg_op = 'UPDATE' then
    if new.task_id is null or new.done is not distinct from old.done then return new; end if;
    insert into public.task_changes(project_id, task_id, task_name, kind, field, new_value, author)
    select t.project_id, t.id, t.name, 'todo', case when new.done then 'done' else 'undone' end, new.text, auth.uid() from public.tasks t where t.id = new.task_id;
  end if;
  return new;
end $$;
drop trigger if exists track_todos on public.todos;
create trigger track_todos after insert or update on public.todos for each row execute function public.log_todo_change();

-- ---------- RLS ----------
alter table public.task_changes enable row level security;
alter table public.change_reads enable row level security;
drop policy if exists chg_select on public.task_changes;
create policy chg_select on public.task_changes for select to authenticated
  using (public.is_member(project_id) and (public.is_lead(project_id) or exists (select 1 from public.tasks t where t.id = task_id and public.group_visible(t.project_id, t.group_id)) or not exists (select 1 from public.tasks t where t.id = task_id)));
drop policy if exists chg_delete on public.task_changes;
create policy chg_delete on public.task_changes for delete to authenticated using (public.is_lead(project_id));
drop policy if exists reads_all on public.change_reads;
create policy reads_all on public.change_reads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- hromadné „vzít na vědomí“
create or replace function public.mark_changes_read(ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.change_reads(change_id, user_id) select unnest(ids), auth.uid() on conflict do nothing;
  get diagnostics n = row_count; return n;
end $$;
grant execute on function public.mark_changes_read(uuid[]) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.task_changes;
exception when duplicate_object then null; end $$;
