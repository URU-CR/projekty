-- 026: osobní poznámky (nadpis + tělo); vidí a upravuje je jen autor
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references auth.users(id) on delete cascade,
  title       text not null default '',
  body        text not null default '',
  open        boolean not null default true,   -- rozbalená v panelu
  sort        int not null default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists notes_owner_idx on public.notes(owner, sort);
drop trigger if exists touch_notes on public.notes;
create trigger touch_notes before update on public.notes for each row execute function public.touch_updated_at();
alter table public.notes enable row level security;
drop policy if exists notes_own on public.notes;
create policy notes_own on public.notes for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
do $$ begin
  alter publication supabase_realtime add table public.notes;
exception when duplicate_object then null; end $$;
