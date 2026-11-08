-- Leaderboards for the territory war (save v4).
--
-- The game changed from paying a bill to taking land back, so the old damage boards
-- (public.scores) are left as they were and no longer used. These boards start empty:
--   * best territory share ever held (percent of the open map);
--   * fastest win per difficulty.
--
-- Same model as before: anonymous auth, no direct table access, security-definer functions
-- with light plausibility checks (the game is client-authoritative):
--   * credited play time grows no faster than the wall clock;
--   * a territory share needs some play behind it (nature starts at about 12%);
--   * a win takes at least 15 minutes and cannot be faster than the play time behind it;
--   * at most one update per 15 seconds per player.

create table if not exists public.territory_scores (
  player_id         uuid primary key references auth.users (id) on delete cascade,
  nickname          text not null check (char_length(nickname) between 1 and 20),
  best_territory    double precision not null default 0 check (best_territory between 0 and 100),
  play_time_s       bigint not null default 0 check (play_time_s >= 0),
  credited_play_s   double precision not null default 0 check (credited_play_s >= 0),
  runs              integer not null default 0 check (runs >= 0),
  wins              integer not null default 0 check (wins >= 0),
  fastest_normal_s  integer check (fastest_normal_s is null or fastest_normal_s > 0),
  fastest_hard_s    integer check (fastest_hard_s is null or fastest_hard_s > 0),
  fastest_brutal_s  integer check (fastest_brutal_s is null or fastest_brutal_s > 0),
  flagged           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists territory_best_idx on public.territory_scores (best_territory desc) where not flagged;
create index if not exists territory_fast_normal_idx on public.territory_scores (fastest_normal_s) where fastest_normal_s is not null and not flagged;
create index if not exists territory_fast_hard_idx on public.territory_scores (fastest_hard_s) where fastest_hard_s is not null and not flagged;
create index if not exists territory_fast_brutal_idx on public.territory_scores (fastest_brutal_s) where fastest_brutal_s is not null and not flagged;

alter table public.territory_scores enable row level security;
revoke all on table public.territory_scores from anon, authenticated;

-- Highest plausible territory share (percent) after `seconds` of credited play.
create or replace function public.max_plausible_territory(seconds double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select least(100, 20 + greatest(seconds, 0) / 60.0 * 4);
$$;

create or replace function public.submit_territory(
  p_nickname          text,
  p_best_territory    double precision,
  p_play_time_s       bigint,
  p_runs              integer,
  p_wins              integer,
  p_fastest_normal_s  integer,
  p_fastest_hard_s    integer,
  p_fastest_brutal_s  integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid      uuid := auth.uid();
  prev     public.territory_scores%rowtype;
  credited double precision;
  elapsed  double precision;
  nick     text := btrim(coalesce(p_nickname, ''));
  fastest  integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if char_length(nick) < 1 or char_length(nick) > 20 or nick ~ '[[:cntrl:]]' then
    raise exception 'invalid nickname' using errcode = '22023';
  end if;
  if p_best_territory is null or p_best_territory = 'NaN'::double precision or p_best_territory < 0 or p_best_territory > 100 then
    raise exception 'invalid score' using errcode = '22023';
  end if;
  if p_play_time_s is null or p_play_time_s < 0 or p_runs is null or p_runs < 0
     or p_wins is null or p_wins < 0 or p_wins > p_runs then
    raise exception 'invalid progress' using errcode = '22023';
  end if;
  fastest := least(coalesce(p_fastest_normal_s, 2147483647), coalesce(p_fastest_hard_s, 2147483647), coalesce(p_fastest_brutal_s, 2147483647));
  if fastest < 2147483647 and (fastest < 900 or fastest > p_play_time_s or p_wins < 1) then
    raise exception 'implausible win time' using errcode = '22023';
  end if;

  select * into prev from public.territory_scores where player_id = uid for update;

  if not found then
    credited := least(p_play_time_s, 7200);
    if p_best_territory > public.max_plausible_territory(credited) then
      raise exception 'implausible score' using errcode = '22023';
    end if;
    insert into public.territory_scores (player_id, nickname, best_territory, play_time_s, credited_play_s,
                                         runs, wins, fastest_normal_s, fastest_hard_s, fastest_brutal_s)
    values (uid, nick, p_best_territory, p_play_time_s, credited,
            p_runs, p_wins, p_fastest_normal_s, p_fastest_hard_s, p_fastest_brutal_s);
    return;
  end if;

  elapsed := extract(epoch from (now() - prev.updated_at));

  if elapsed < 15 then
    if nick <> prev.nickname then
      update public.territory_scores set nickname = nick where player_id = uid;
    end if;
    return;
  end if;

  if p_play_time_s >= prev.play_time_s then
    credited := prev.credited_play_s + least(p_play_time_s - prev.play_time_s, elapsed + 60);
  else
    credited := prev.credited_play_s;
  end if;

  if p_best_territory > public.max_plausible_territory(credited) then
    raise exception 'implausible score' using errcode = '22023';
  end if;

  update public.territory_scores
     set nickname         = nick,
         best_territory   = greatest(prev.best_territory, p_best_territory),
         play_time_s      = p_play_time_s,
         credited_play_s  = credited,
         runs             = greatest(prev.runs, p_runs),
         wins             = greatest(prev.wins, p_wins),
         fastest_normal_s = public.least_time(prev.fastest_normal_s, p_fastest_normal_s),
         fastest_hard_s   = public.least_time(prev.fastest_hard_s, p_fastest_hard_s),
         fastest_brutal_s = public.least_time(prev.fastest_brutal_s, p_fastest_brutal_s),
         updated_at       = now()
   where player_id = uid;
end;
$$;

create or replace function public.territory_best(p_limit integer default 50)
returns table (rank bigint, nickname text, value double precision, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select s.player_id, s.nickname, s.best_territory as value,
           rank() over (order by s.best_territory desc, s.created_at asc) as rank
      from public.territory_scores s
     where not s.flagged and s.best_territory > 0
  )
  select r.rank, r.nickname, r.value, coalesce(r.player_id = auth.uid(), false)
    from ranked r
   where r.rank <= least(greatest(coalesce(p_limit, 50), 1), 100) or r.player_id = auth.uid()
   order by r.rank;
$$;

create or replace function public.territory_fastest(p_difficulty text, p_limit integer default 50)
returns table (rank bigint, nickname text, value double precision, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with times as (
    select s.player_id, s.nickname, s.created_at,
           case p_difficulty
             when 'normal' then s.fastest_normal_s
             when 'hard' then s.fastest_hard_s
             when 'brutal' then s.fastest_brutal_s
           end as t
      from public.territory_scores s
     where not s.flagged
  ), ranked as (
    select player_id, nickname, t::double precision as value,
           rank() over (order by t asc, created_at asc) as rank
      from times
     where t is not null
  )
  select r.rank, r.nickname, r.value, coalesce(r.player_id = auth.uid(), false)
    from ranked r
   where r.rank <= least(greatest(coalesce(p_limit, 50), 1), 100) or r.player_id = auth.uid()
   order by r.rank;
$$;

revoke all on function public.submit_territory(text, double precision, bigint, integer, integer, integer, integer, integer) from public;
revoke all on function public.territory_best(integer) from public;
revoke all on function public.territory_fastest(text, integer) from public;
revoke all on function public.max_plausible_territory(double precision) from public;

grant execute on function public.submit_territory(text, double precision, bigint, integer, integer, integer, integer, integer) to authenticated;
grant execute on function public.territory_best(integer) to anon, authenticated;
grant execute on function public.territory_fastest(text, integer) to anon, authenticated;
