-- 012: smazání uživatele v Supabase nesmí blokovat jeho autorství.
-- Vazby na auth.users se mění na ON DELETE SET NULL (autor zůstane prázdný, data zůstanou);
-- členství, přístupy a osobní ToDo se při smazání uživatele odstraní (už je nastaveno CASCADE).
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
      and c.conrelid::regclass::text in ('projects','tasks','task_log','documents','proposals','proposal_versions')
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references auth.users(id) on delete set null', r.tbl, r.conname, r.col);
  end loop;
end $$;
-- profil se smaže kaskádou (profiles.id → auth.users CASCADE); jména v týmu zůstanou, jen bez vazby na účet (project_team.user_id SET NULL)
