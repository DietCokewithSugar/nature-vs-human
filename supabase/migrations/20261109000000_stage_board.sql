-- Leaderboard for the three-lane game (save v5): the highest stage cleared.
--
-- The territory boards (public.territory_scores) are left as they were and no longer used.
-- Same model as before: anonymous auth, no direct table access, security-definer functions
-- with light plausibility checks (the game is client-authoritative):
--   * credited play time grows no faster than the wall clock;
--   * a stage takes at least 40 seconds of play;
--   * at most one update per 15 seconds per player.

create table if not exists public.stage_scores (
  player_id        uuid primary key references auth.users (id) on delete cascade,
  nickname         text not null check (char_length(nickname) between 1 and 20),
  best_stage       integer not null default 0 check (best_stage >= 0),
  play_time_s      bigint not null default 0 check (play_time_s >= 0),
  credited_play_s  double precision not null default 0 check (credited_play_s >= 0),
  runs             integer not null default 0 check (runs >= 0),
  flagged          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists stage_best_idx on public.stage_scores (best_stage desc) where not flagged;

alter table public.stage_scores enable row level security;
revoke all on table public.stage_scores from anon, authenticated;

-- Highest plausible stage after `seconds` of credited play.
create or replace function public.max_plausible_stage(seconds double precision)
returns integer
language sql
immutable
set search_path = ''
as $$
  select floor(greatest(seconds, 0) / 40.0)::integer;
$$;

create or replace function public.submit_stage(
  p_nickname     text,
  p_best_stage   integer,
  p_play_time_s  bigint,
  p_runs         integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid      uuid := auth.uid();
  prev     public.stage_scores%rowtype;
  credited double precision;
  elapsed  double precision;
  nick     text := btrim(coalesce(p_nickname, ''));
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if char_length(nick) < 1 or char_length(nick) > 20 or nick ~ '[[:cntrl:]]' then
    raise exception 'invalid nickname' using errcode = '22023';
  end if;
  if p_best_stage is null or p_best_stage < 0 or p_best_stage > 100000 then
    raise exception 'invalid score' using errcode = '22023';
  end if;
  if p_play_time_s is null or p_play_time_s < 0 or p_runs is null or p_runs < 0 then
    raise exception 'invalid progress' using errcode = '22023';
  end if;

  select * into prev from public.stage_scores where player_id = uid for update;

  if not found then
    credited := least(p_play_time_s, 7200);
    if p_best_stage > public.max_plausible_stage(credited) then
      raise exception 'implausible score' using errcode = '22023';
    end if;
    insert into public.stage_scores (player_id, nickname, best_stage, play_time_s, credited_play_s, runs)
    values (uid, nick, p_best_stage, p_play_time_s, credited, p_runs);
    return;
  end if;

  elapsed := extract(epoch from (now() - prev.updated_at));

  if elapsed < 15 then
    if nick <> prev.nickname then
      update public.stage_scores set nickname = nick where player_id = uid;
    end if;
    return;
  end if;

  if p_play_time_s >= prev.play_time_s then
    credited := prev.credited_play_s + least(p_play_time_s - prev.play_time_s, elapsed + 60);
  else
    credited := prev.credited_play_s;
  end if;

  if p_best_stage > public.max_plausible_stage(credited) then
    raise exception 'implausible score' using errcode = '22023';
  end if;

  update public.stage_scores
     set nickname        = nick,
         best_stage      = greatest(prev.best_stage, p_best_stage),
         play_time_s     = p_play_time_s,
         credited_play_s = credited,
         runs            = greatest(prev.runs, p_runs),
         updated_at      = now()
   where player_id = uid;
end;
$$;

create or replace function public.stage_best(p_limit integer default 50)
returns table (rank bigint, nickname text, value double precision, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select s.player_id, s.nickname, s.best_stage::double precision as value,
           rank() over (order by s.best_stage desc, s.created_at asc) as rank
      from public.stage_scores s
     where not s.flagged and s.best_stage > 0
  )
  select r.rank, r.nickname, r.value, coalesce(r.player_id = auth.uid(), false)
    from ranked r
   where r.rank <= least(greatest(coalesce(p_limit, 50), 1), 100) or r.player_id = auth.uid()
   order by r.rank;
$$;

revoke all on function public.submit_stage(text, integer, bigint, integer) from public;
revoke all on function public.stage_best(integer) from public;
revoke all on function public.max_plausible_stage(double precision) from public;
grant execute on function public.submit_stage(text, integer, bigint, integer) to authenticated;
grant execute on function public.stage_best(integer) to anon, authenticated;
