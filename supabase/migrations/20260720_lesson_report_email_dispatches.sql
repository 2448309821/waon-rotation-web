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
