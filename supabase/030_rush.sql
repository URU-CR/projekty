-- 030: příznak „Spěchá“ (časový tlak teď; nezávisle na „kritický“)
alter table public.tasks add column if not exists rush boolean not null default false;
