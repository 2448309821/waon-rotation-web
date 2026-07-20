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

