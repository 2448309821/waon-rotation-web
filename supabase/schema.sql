create table if not exists public.rotation_states (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.rotation_states enable row level security;

drop policy if exists "public read rotation_states" on public.rotation_states;
create policy "public read rotation_states"
  on public.rotation_states
  for select
  to anon, authenticated
  using (true);

drop policy if exists "public write rotation_states" on public.rotation_states;
create policy "public write rotation_states"
  on public.rotation_states
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "public update rotation_states" on public.rotation_states;
create policy "public update rotation_states"
  on public.rotation_states
  for update
  to anon, authenticated
  using (true)
  with check (true);

-- Keep a server-side revision before every shared-state update.
create table if not exists public.rotation_state_revisions (
  revision_id bigint generated always as identity primary key,
  state_id text not null,
  state jsonb not null,
  source_updated_at timestamptz,
  archived_at timestamptz not null default timezone('utc', now())
);

create index if not exists rotation_state_revisions_state_id_archived_at_idx
  on public.rotation_state_revisions (state_id, archived_at desc);

alter table public.rotation_state_revisions enable row level security;

create or replace function public.archive_rotation_state_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.state is distinct from new.state then
    insert into public.rotation_state_revisions (state_id, state, source_updated_at)
    values (old.id, old.state, old.updated_at);

    delete from public.rotation_state_revisions
    where revision_id in (
      select revision_id
      from public.rotation_state_revisions
      where state_id = old.id
      order by archived_at desc, revision_id desc
      offset 200
    );
  end if;

  return new;
end;
$$;

drop trigger if exists archive_rotation_state_before_update on public.rotation_states;
create trigger archive_rotation_state_before_update
  before update on public.rotation_states
  for each row
  execute function public.archive_rotation_state_revision();

create table if not exists public.schedule_email_dispatches (
  month_key text primary key check (month_key ~ '^\d{4}-\d{1,2}$'),
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  sender_name text not null,
  recipient_count integer not null check (recipient_count > 0),
  subject text not null,
  content_hash text not null,
  attempt_count integer not null default 1,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schedule_email_dispatches enable row level security;

comment on table public.schedule_email_dispatches is
  'Service-role-only idempotency log for finalized Wawon schedule emails.';

create table if not exists public.lesson_report_email_dispatches (
  dispatch_key text primary key check (dispatch_key ~ '^[a-f0-9]{64}$'),
  month_key text not null check (month_key ~ '^\d{4}-\d{1,2}$'),
  report_id text not null,
  report_updated_at timestamptz not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  sender_name text not null,
  recipient_count integer not null check (recipient_count > 0),
  subject text not null,
  content_hash text not null,
  attempt_count integer not null default 1,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lesson_report_email_dispatches_report_idx
  on public.lesson_report_email_dispatches (month_key, report_id, report_updated_at desc);

alter table public.lesson_report_email_dispatches enable row level security;

comment on table public.lesson_report_email_dispatches is
  'Service-role-only idempotency log for Wawon lesson report emails. A changed report creates a new dispatch key.';
