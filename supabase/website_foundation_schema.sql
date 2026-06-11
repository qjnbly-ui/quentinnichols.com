-- quentinnichols.com website data foundation.
-- Run this in the Supabase SQL editor for the dedicated website project.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  timezone text not null default 'America/Los_Angeles',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  status text not null default 'confirmed' check (status in ('confirmed', 'tentative', 'cancelled')),
  source text not null default 'dashboard',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'archived')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  due_at timestamptz,
  completed_at timestamptz,
  source text not null default 'dashboard',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text,
  body text not null default '',
  source text not null default 'dashboard',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  preferred_name text,
  photo_url text,
  phone text,
  email text,
  tags text[] not null default '{}'::text[],
  first_met_at timestamptz,
  first_met_location text,
  overview text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists people_id_owner_id_key on public.people(id, owner_id);

create table if not exists public.person_interactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid not null,
  occurred_at timestamptz not null default now(),
  location text,
  notes text not null default '',
  mood text,
  topics text[] not null default '{}'::text[],
  ai_summary text,
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (person_id, owner_id) references public.people(id, owner_id) on delete cascade
);

create unique index if not exists person_interactions_id_owner_id_key on public.person_interactions(id, owner_id);

create table if not exists public.person_memory_cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid not null,
  category text not null default 'general',
  label text not null,
  value text not null,
  confidence numeric(4, 3) not null default 1.0 check (confidence >= 0 and confidence <= 1),
  source_interaction_id uuid references public.person_interactions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (person_id, owner_id) references public.people(id, owner_id) on delete cascade
);

create table if not exists public.person_follow_up_reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid not null,
  interaction_id uuid references public.person_interactions(id) on delete set null,
  title text not null,
  details text,
  remind_at timestamptz,
  status text not null default 'open' check (status in ('open', 'done', 'dismissed', 'archived')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (person_id, owner_id) references public.people(id, owner_id) on delete cascade
);

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_context_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('calendar_event', 'task', 'note', 'conversation', 'person', 'person_interaction', 'document', 'website', 'manual')),
  source_id uuid,
  title text,
  content text not null,
  importance integer not null default 0 check (importance between 0 and 100),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  phone text,
  subject text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'read', 'replied', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_events_owner_starts_at_idx on public.calendar_events(owner_id, starts_at);
create index if not exists tasks_owner_status_due_at_idx on public.tasks(owner_id, status, due_at);
create index if not exists notes_owner_created_at_idx on public.notes(owner_id, created_at desc);
create index if not exists people_owner_name_idx on public.people(owner_id, name);
create index if not exists people_owner_tags_idx on public.people using gin(tags);
create index if not exists person_interactions_person_occurred_at_idx on public.person_interactions(person_id, occurred_at desc);
create index if not exists person_interactions_owner_topics_idx on public.person_interactions using gin(topics);
create index if not exists person_memory_cards_person_category_idx on public.person_memory_cards(person_id, category);
create index if not exists person_follow_up_reminders_owner_status_remind_at_idx on public.person_follow_up_reminders(owner_id, status, remind_at);
create index if not exists ai_conversations_owner_created_at_idx on public.ai_conversations(owner_id, created_at desc);
create index if not exists ai_messages_conversation_created_at_idx on public.ai_messages(conversation_id, created_at);
create index if not exists ai_context_items_owner_source_idx on public.ai_context_items(owner_id, source_type, source_id);
create index if not exists contact_inquiries_status_created_at_idx on public.contact_inquiries(status, created_at desc);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_calendar_events_updated_at on public.calendar_events;
create trigger set_calendar_events_updated_at
before update on public.calendar_events
for each row execute function public.set_updated_at();

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

drop trigger if exists set_notes_updated_at on public.notes;
create trigger set_notes_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

drop trigger if exists set_people_updated_at on public.people;
create trigger set_people_updated_at
before update on public.people
for each row execute function public.set_updated_at();

drop trigger if exists set_person_interactions_updated_at on public.person_interactions;
create trigger set_person_interactions_updated_at
before update on public.person_interactions
for each row execute function public.set_updated_at();

drop trigger if exists set_person_memory_cards_updated_at on public.person_memory_cards;
create trigger set_person_memory_cards_updated_at
before update on public.person_memory_cards
for each row execute function public.set_updated_at();

drop trigger if exists set_person_follow_up_reminders_updated_at on public.person_follow_up_reminders;
create trigger set_person_follow_up_reminders_updated_at
before update on public.person_follow_up_reminders
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_conversations_updated_at on public.ai_conversations;
create trigger set_ai_conversations_updated_at
before update on public.ai_conversations
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_context_items_updated_at on public.ai_context_items;
create trigger set_ai_context_items_updated_at
before update on public.ai_context_items
for each row execute function public.set_updated_at();

drop trigger if exists set_contact_inquiries_updated_at on public.contact_inquiries;
create trigger set_contact_inquiries_updated_at
before update on public.contact_inquiries
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do update
  set email = excluded.email,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.calendar_events enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.people enable row level security;
alter table public.person_interactions enable row level security;
alter table public.person_memory_cards enable row level security;
alter table public.person_follow_up_reminders enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_context_items enable row level security;
alter table public.contact_inquiries enable row level security;

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.calendar_events to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.notes to authenticated;
grant select, insert, update, delete on public.people to authenticated;
grant select, insert, update, delete on public.person_interactions to authenticated;
grant select, insert, update, delete on public.person_memory_cards to authenticated;
grant select, insert, update, delete on public.person_follow_up_reminders to authenticated;
grant select, insert, update, delete on public.ai_conversations to authenticated;
grant select, insert, update, delete on public.ai_messages to authenticated;
grant select, insert, update, delete on public.ai_context_items to authenticated;
grant select, insert, update, delete on public.contact_inquiries to authenticated;

create or replace function public.delete_person_profile(target_person_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_owner uuid := auth.uid();
begin
  if current_owner is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.people
    where id = target_person_id
      and owner_id = current_owner
  ) then
    raise exception 'Person not found.';
  end if;

  delete from public.person_follow_up_reminders
  where person_id = target_person_id
    and owner_id = current_owner;

  delete from public.person_memory_cards
  where person_id = target_person_id
    and owner_id = current_owner;

  delete from public.person_interactions
  where person_id = target_person_id
    and owner_id = current_owner;

  delete from public.ai_context_items
  where owner_id = current_owner
    and source_type = 'person'
    and source_id = target_person_id;

  delete from public.people
  where id = target_person_id
    and owner_id = current_owner;
end;
$$;

alter function public.delete_person_profile(uuid) owner to postgres;

revoke execute on function public.delete_person_profile(uuid) from public;
grant execute on function public.delete_person_profile(uuid) to authenticated;

revoke execute on function public.handle_new_user() from public;

drop policy if exists "Profiles are owner readable" on public.profiles;
create policy "Profiles are owner readable"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "Profiles are owner editable" on public.profiles;
create policy "Profiles are owner editable"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Calendar events are owner managed" on public.calendar_events;
create policy "Calendar events are owner managed"
on public.calendar_events for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Tasks are owner managed" on public.tasks;
create policy "Tasks are owner managed"
on public.tasks for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Notes are owner managed" on public.notes;
create policy "Notes are owner managed"
on public.notes for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "People are owner managed" on public.people;
create policy "People are owner managed"
on public.people for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Person interactions are owner managed" on public.person_interactions;
create policy "Person interactions are owner managed"
on public.person_interactions for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Person memory cards are owner managed" on public.person_memory_cards;
create policy "Person memory cards are owner managed"
on public.person_memory_cards for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Person follow-up reminders are owner managed" on public.person_follow_up_reminders;
create policy "Person follow-up reminders are owner managed"
on public.person_follow_up_reminders for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "AI conversations are owner managed" on public.ai_conversations;
create policy "AI conversations are owner managed"
on public.ai_conversations for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "AI messages are owner managed" on public.ai_messages;
create policy "AI messages are owner managed"
on public.ai_messages for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "AI context items are owner managed" on public.ai_context_items;
create policy "AI context items are owner managed"
on public.ai_context_items for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Contact inquiries are authenticated readable" on public.contact_inquiries;
create policy "Contact inquiries are authenticated readable"
on public.contact_inquiries for select
to authenticated
using (true);

drop policy if exists "Contact inquiries are authenticated manageable" on public.contact_inquiries;
create policy "Contact inquiries are authenticated manageable"
on public.contact_inquiries for update
to authenticated
using (true)
with check (true);
