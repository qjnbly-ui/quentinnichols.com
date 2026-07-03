-- Fitness module schema for the private dashboard.
-- Run this in the Supabase SQL editor after website_foundation_schema.sql.

create extension if not exists pgcrypto;

create table if not exists public.fitness_workout_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  rounds integer not null default 1 check (rounds between 1 and 30),
  exercises jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fitness_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid references public.fitness_workout_templates(id) on delete set null,
  template_name text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_sets integer not null default 0 check (completed_sets >= 0),
  total_sets integer not null default 0 check (total_sets >= 0),
  exercises jsonb not null default '[]'::jsonb,
  detected_prs jsonb not null default '[]'::jsonb,
  energy integer check (energy between 1 and 5),
  mood integer check (mood between 1 and 5),
  soreness integer check (soreness between 1 and 5),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fitness_prs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  exercise text not null,
  value text not null,
  e1rm numeric,
  recorded_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual', 'auto')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fitness_checkins (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  checked_at timestamptz not null default now(),
  energy integer check (energy between 1 and 5),
  mood integer check (mood between 1 and 5),
  soreness integer check (soreness between 1 and 5),
  sleep integer check (sleep between 1 and 5),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fitness_habits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'manual',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table if not exists public.fitness_habit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid references public.fitness_habits(id) on delete set null,
  habit text not null,
  logged_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fitness_workout_templates_owner_active_idx on public.fitness_workout_templates(owner_id, is_active, updated_at desc);
create index if not exists fitness_sessions_owner_started_at_idx on public.fitness_sessions(owner_id, started_at desc);
create index if not exists fitness_prs_owner_exercise_recorded_at_idx on public.fitness_prs(owner_id, exercise, recorded_at desc);
create index if not exists fitness_checkins_owner_checked_at_idx on public.fitness_checkins(owner_id, checked_at desc);
create index if not exists fitness_habits_owner_active_name_idx on public.fitness_habits(owner_id, is_active, name);
create index if not exists fitness_habit_logs_owner_logged_at_idx on public.fitness_habit_logs(owner_id, logged_at desc);

drop trigger if exists set_fitness_workout_templates_updated_at on public.fitness_workout_templates;
create trigger set_fitness_workout_templates_updated_at
before update on public.fitness_workout_templates
for each row execute function public.set_updated_at();

drop trigger if exists set_fitness_sessions_updated_at on public.fitness_sessions;
create trigger set_fitness_sessions_updated_at
before update on public.fitness_sessions
for each row execute function public.set_updated_at();

drop trigger if exists set_fitness_prs_updated_at on public.fitness_prs;
create trigger set_fitness_prs_updated_at
before update on public.fitness_prs
for each row execute function public.set_updated_at();

drop trigger if exists set_fitness_checkins_updated_at on public.fitness_checkins;
create trigger set_fitness_checkins_updated_at
before update on public.fitness_checkins
for each row execute function public.set_updated_at();

drop trigger if exists set_fitness_habits_updated_at on public.fitness_habits;
create trigger set_fitness_habits_updated_at
before update on public.fitness_habits
for each row execute function public.set_updated_at();

drop trigger if exists set_fitness_habit_logs_updated_at on public.fitness_habit_logs;
create trigger set_fitness_habit_logs_updated_at
before update on public.fitness_habit_logs
for each row execute function public.set_updated_at();

alter table public.fitness_workout_templates enable row level security;
alter table public.fitness_sessions enable row level security;
alter table public.fitness_prs enable row level security;
alter table public.fitness_checkins enable row level security;
alter table public.fitness_habits enable row level security;
alter table public.fitness_habit_logs enable row level security;

grant select, insert, update, delete on public.fitness_workout_templates to authenticated;
grant select, insert, update, delete on public.fitness_sessions to authenticated;
grant select, insert, update, delete on public.fitness_prs to authenticated;
grant select, insert, update, delete on public.fitness_checkins to authenticated;
grant select, insert, update, delete on public.fitness_habits to authenticated;
grant select, insert, update, delete on public.fitness_habit_logs to authenticated;

drop policy if exists "Fitness workout templates are owner managed" on public.fitness_workout_templates;
create policy "Fitness workout templates are owner managed"
on public.fitness_workout_templates for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Fitness sessions are owner managed" on public.fitness_sessions;
create policy "Fitness sessions are owner managed"
on public.fitness_sessions for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Fitness PRs are owner managed" on public.fitness_prs;
create policy "Fitness PRs are owner managed"
on public.fitness_prs for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Fitness check-ins are owner managed" on public.fitness_checkins;
create policy "Fitness check-ins are owner managed"
on public.fitness_checkins for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Fitness habits are owner managed" on public.fitness_habits;
create policy "Fitness habits are owner managed"
on public.fitness_habits for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Fitness habit logs are owner managed" on public.fitness_habit_logs;
create policy "Fitness habit logs are owner managed"
on public.fitness_habit_logs for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());
