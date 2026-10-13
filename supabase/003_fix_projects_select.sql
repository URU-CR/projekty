-- 003: oprava zápisu nového projektu.
-- Příčina: při INSERT ... ON CONFLICT (upsert) Postgres kontroluje nový řádek i proti politice SELECT.
-- Ta se opírala o členství, které vytváří až trigger PO vložení, proto zápis padal na RLS.
-- Zakladatel projektu (created_by) teď řádek vidí přímo, bez ohledu na členství.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (created_by = auth.uid() or public.is_member(id));
