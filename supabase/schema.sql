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
