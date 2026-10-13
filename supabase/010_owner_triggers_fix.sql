-- 010: oprava triggerů z 009 – každá tabulka má vlastní funkci (společná sahala na neexistující sloupce)
do $$ declare t text; begin
  foreach t in array array['proposals','tasks','todos','task_log','proposal_versions'] loop
    execute format('drop trigger if exists set_owner_%1$s on public.%1$s', t);
  end loop; end $$;
drop function if exists public.set_owner_cols();

create or replace function public.set_created_by_col() returns trigger language plpgsql security definer set search_path = public as $$
begin if new.created_by is null then new.created_by := auth.uid(); end if; return new; end $$;
create or replace function public.set_owner_col() returns trigger language plpgsql security definer set search_path = public as $$
begin if new.owner is null then new.owner := auth.uid(); end if; return new; end $$;
create or replace function public.set_author_col() returns trigger language plpgsql security definer set search_path = public as $$
begin if new.author is null then new.author := auth.uid(); end if; return new; end $$;

create trigger set_owner_proposals before insert on public.proposals for each row execute function public.set_created_by_col();
create trigger set_owner_tasks before insert on public.tasks for each row execute function public.set_created_by_col();
create trigger set_owner_todos before insert on public.todos for each row execute function public.set_owner_col();
create trigger set_owner_task_log before insert on public.task_log for each row execute function public.set_author_col();
create trigger set_owner_proposal_versions before insert on public.proposal_versions for each row execute function public.set_author_col();
