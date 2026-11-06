-- Leaderboards for 人类账单支付 (run-based version).
--
-- Players sign in anonymously (Supabase anonymous auth), so every row belongs to auth.uid().
-- Clients never touch the table: they call the security-definer functions below, which
-- validate input and keep the server's own account of play time.
--
-- Boards: lifetime damage across runs, best single run, fastest win per difficulty.
--
-- Anti-cheat is deliberately light (the game is client-authoritative):
--   * server-credited play time can grow no faster than the wall clock;
--   * damage must fit under a generous curve of credited play time
--     (the fastest balance-sim bot pays a 1e23 bill in about 34 minutes, see docs/balance.md);
--   * a win takes at least 20 minutes and cannot be faster than the play time behind it;
--   * at most one update per 15 seconds per player.

create table if not exists public.scores (
  player_id         uuid primary key references auth.users (id) on delete cascade,
  nickname          text not null check (char_length(nickname) between 1 and 20),
  lifetime_log10    double precision not null default 0 check (lifetime_log10 between 0 and 1000000),
  best_run_log10    double precision not null default 0 check (best_run_log10 between 0 and 1000000),
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

create index if not exists scores_lifetime_idx on public.scores (lifetime_log10 desc) where not flagged;
create index if not exists scores_best_idx on public.scores (best_run_log10 desc) where not flagged;
create index if not exists scores_fast_normal_idx on public.scores (fastest_normal_s) where fastest_normal_s is not null and not flagged;
create index if not exists scores_fast_hard_idx on public.scores (fastest_hard_s) where fastest_hard_s is not null and not flagged;
create index if not exists scores_fast_brutal_idx on public.scores (fastest_brutal_s) where fastest_brutal_s is not null and not flagged;

alter table public.scores enable row level security;
-- No policies: with RLS on and no grants, the table is reachable only through the functions below.
revoke all on table public.scores from anon, authenticated;

-- Highest plausible log10(damage) after `hours` of credited play.
create or replace function public.max_plausible_log10(hours double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 12 + 40 * sqrt(greatest(hours, 0));
$$;

-- Keep the smaller of two optional times.
create or replace function public.least_time(a integer, b integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when a is null then b when b is null then a else least(a, b) end;
$$;

create or replace function public.submit_score(
  p_nickname          text,
  p_lifetime_log10    double precision,
  p_best_run_log10    double precision,
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
  prev     public.scores%rowtype;
  credited double precision;
  elapsed  double precision;
  nick     text := btrim(coalesce(p_nickname, ''));
  best     double precision := coalesce(p_best_run_log10, 0);
  fastest  integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if char_length(nick) < 1 or char_length(nick) > 20 or nick ~ '[[:cntrl:]]' then
    raise exception 'invalid nickname' using errcode = '22023';
  end if;
  if p_lifetime_log10 is null or p_lifetime_log10 = 'NaN'::double precision
     or p_lifetime_log10 < 0 or p_lifetime_log10 > 1000000
     or best = 'NaN'::double precision or best < 0 or best > p_lifetime_log10 + 1e-9 then
    raise exception 'invalid score' using errcode = '22023';
  end if;
  if p_play_time_s is null or p_play_time_s < 0 or p_runs is null or p_runs < 0
     or p_wins is null or p_wins < 0 or p_wins > p_runs then
    raise exception 'invalid progress' using errcode = '22023';
  end if;
  fastest := least(coalesce(p_fastest_normal_s, 2147483647), coalesce(p_fastest_hard_s, 2147483647), coalesce(p_fastest_brutal_s, 2147483647));
  if fastest < 2147483647 and (fastest < 1200 or fastest > p_play_time_s or p_wins < 1) then
    raise exception 'implausible win time' using errcode = '22023';
  end if;

  select * into prev from public.scores where player_id = uid for update;

  if not found then
    -- A brand-new player gets at most two hours of credit for progress made before first contact.
    credited := least(p_play_time_s, 7200);
    if p_lifetime_log10 > public.max_plausible_log10(credited / 3600.0) then
      raise exception 'implausible score' using errcode = '22023';
    end if;
    insert into public.scores (player_id, nickname, lifetime_log10, best_run_log10, play_time_s, credited_play_s,
                               runs, wins, fastest_normal_s, fastest_hard_s, fastest_brutal_s)
    values (uid, nick, p_lifetime_log10, best, p_play_time_s, credited,
            p_runs, p_wins, p_fastest_normal_s, p_fastest_hard_s, p_fastest_brutal_s);
    return;
  end if;

  elapsed := extract(epoch from (now() - prev.updated_at));

  -- Rate limit: inside the window only a nickname change goes through.
  if elapsed < 15 then
    if nick <> prev.nickname then
      update public.scores set nickname = nick where player_id = uid;
    end if;
    return;
  end if;

  -- Credited play time grows by what the client claims, but never faster than the wall clock.
  if p_play_time_s >= prev.play_time_s then
    credited := prev.credited_play_s + least(p_play_time_s - prev.play_time_s, elapsed + 60);
  else
    -- The player started over. Keep the credit already earned.
    credited := prev.credited_play_s;
  end if;

  if p_lifetime_log10 > public.max_plausible_log10(credited / 3600.0) then
    raise exception 'implausible score' using errcode = '22023';
  end if;

  update public.scores
     set nickname         = nick,
         lifetime_log10   = greatest(prev.lifetime_log10, p_lifetime_log10),
         best_run_log10   = greatest(prev.best_run_log10, best),
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

-- Top N by a log10 damage column, plus the caller's own row wherever it ranks.
create or replace function public.leaderboard_lifetime(p_limit integer default 50)
returns table (rank bigint, nickname text, value double precision, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select s.player_id, s.nickname, s.lifetime_log10 as value,
           rank() over (order by s.lifetime_log10 desc, s.created_at asc) as rank
      from public.scores s
     where not s.flagged and s.lifetime_log10 > 0
  )
  select r.rank, r.nickname, r.value, coalesce(r.player_id = auth.uid(), false)
    from ranked r
   where r.rank <= least(greatest(coalesce(p_limit, 50), 1), 100) or r.player_id = auth.uid()
   order by r.rank;
$$;

create or replace function public.leaderboard_best(p_limit integer default 50)
returns table (rank bigint, nickname text, value double precision, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select s.player_id, s.nickname, s.best_run_log10 as value,
           rank() over (order by s.best_run_log10 desc, s.created_at asc) as rank
      from public.scores s
     where not s.flagged and s.best_run_log10 > 0
  )
  select r.rank, r.nickname, r.value, coalesce(r.player_id = auth.uid(), false)
    from ranked r
   where r.rank <= least(greatest(coalesce(p_limit, 50), 1), 100) or r.player_id = auth.uid()
   order by r.rank;
$$;

-- Fastest wins on one difficulty (seconds, lower is better).
create or replace function public.leaderboard_fastest(p_difficulty text, p_limit integer default 50)
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
      from public.scores s
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

revoke all on function public.submit_score(text, double precision, double precision, bigint, integer, integer, integer, integer, integer) from public;
revoke all on function public.leaderboard_lifetime(integer) from public;
revoke all on function public.leaderboard_best(integer) from public;
revoke all on function public.leaderboard_fastest(text, integer) from public;
revoke all on function public.max_plausible_log10(double precision) from public;
revoke all on function public.least_time(integer, integer) from public;

grant execute on function public.submit_score(text, double precision, double precision, bigint, integer, integer, integer, integer, integer) to authenticated;
grant execute on function public.leaderboard_lifetime(integer) to anon, authenticated;
grant execute on function public.leaderboard_best(integer) to anon, authenticated;
grant execute on function public.leaderboard_fastest(text, integer) to anon, authenticated;
