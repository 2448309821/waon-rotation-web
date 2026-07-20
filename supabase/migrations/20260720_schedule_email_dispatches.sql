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
