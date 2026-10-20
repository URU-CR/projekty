-- 027: zápis do deníku úkolu – povolit i UPDATE (upsert existujícího řádku) tomu, kdo smí úkol upravovat
drop policy if exists log_update on public.task_log;
create policy log_update on public.task_log for update to authenticated
  using (public.task_writable(task_id)) with check (public.task_writable(task_id));
drop policy if exists log_delete on public.task_log;
create policy log_delete on public.task_log for delete to authenticated
  using (author = auth.uid() or public.task_writable(task_id));
