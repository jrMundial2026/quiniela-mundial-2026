-- Ejecuta esto en el SQL editor de Supabase.
-- Si ya creaste la versión anterior, este script agrega el nuevo campo de pronóstico por resultado.
-- Luego crea un usuario de admin en Authentication.

create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  round text,
  group_letter text,
  kickoff_at timestamptz,
  home_team text not null,
  away_team text not null,
  home_goals integer,
  away_goals integer,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);



alter table public.matches
  add column if not exists group_letter text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'matches_group_letter_check'
      and conrelid = 'public.matches'::regclass
  ) then
    alter table public.matches
      add constraint matches_group_letter_check
      check (group_letter in ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L') or group_letter is null);
  end if;
end $$;

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  prediction_result text,
  home_goals integer,
  away_goals integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, match_id)
);

alter table public.predictions
  add column if not exists prediction_result text;

update public.predictions
set prediction_result = case
  when prediction_result is not null then prediction_result
  when home_goals is not null and away_goals is not null and home_goals > away_goals then 'HOME'
  when home_goals is not null and away_goals is not null and home_goals < away_goals then 'AWAY'
  when home_goals is not null and away_goals is not null and home_goals = away_goals then 'DRAW'
  else prediction_result
end
where prediction_result is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'predictions_prediction_result_check'
      and conrelid = 'public.predictions'::regclass
  ) then
    alter table public.predictions
      add constraint predictions_prediction_result_check
      check (prediction_result in ('HOME', 'DRAW', 'AWAY') or prediction_result is null);
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_matches_updated_at on public.matches;
drop trigger if exists set_predictions_updated_at on public.predictions;

create trigger set_matches_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

create trigger set_predictions_updated_at
before update on public.predictions
for each row execute function public.set_updated_at();

alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;

drop policy if exists "Public read players" on public.players;
drop policy if exists "Public read matches" on public.matches;
drop policy if exists "Public read predictions" on public.predictions;
drop policy if exists "Auth write players" on public.players;
drop policy if exists "Auth write matches" on public.matches;
drop policy if exists "Auth write predictions" on public.predictions;

-- Lectura pública para la tabla general.
create policy "Public read players" on public.players
for select using (true);

create policy "Public read matches" on public.matches
for select using (true);

create policy "Public read predictions" on public.predictions
for select using (true);

-- Escritura solo para usuarios autenticados.
create policy "Auth write players" on public.players
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Auth write matches" on public.matches
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Auth write predictions" on public.predictions
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Realtime: habilita la publicación para que los cambios se vean al instante.
do $$
begin
  begin
    alter publication supabase_realtime add table public.players;
  exception when duplicate_object then
    null;
  end;
  begin
    alter publication supabase_realtime add table public.matches;
  exception when duplicate_object then
    null;
  end;
  begin
    alter publication supabase_realtime add table public.predictions;
  exception when duplicate_object then
    null;
  end;
end $$;
