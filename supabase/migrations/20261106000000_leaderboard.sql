-- Leaderboard for 人类账单支付.
--
-- Players sign in anonymously (Supabase anonymous auth), so every row belongs to auth.uid().
-- Clients never touch the table directly: they call the security-definer functions below,
-- which validate input and keep the server's own account of play time.
--
-- Anti-cheat is deliberately light. The game is client-authoritative, so the goal is only
-- to stop obviously edited numbers:
--   * server-credited play time can grow no faster than the wall clock;
--   * lifetime damage must fit under a generous curve of credited play time
--     (the fastest balance-sim bot reaches 1e30 at about 10.6 hours, see docs/balance.md);
--   * reaching the dinosaur era takes at least 30 minutes;
--   * at most one score update per 15 seconds per player.

create table if not exists public.scores (
  player_id       uuid primary key references auth.users (id) on delete cascade,
  nickname        text not null check (char_length(nickname) between 1 and 20),
  lifetime_log10  double precision not null default 0 check (lifetime_log10 >= 0 and lifetime_log10 <= 1000000),
  -- Play time as reported by the client (informational).
  play_time_s     bigint not null default 0 check (play_time_s >= 0),
  -- Play time the server is willing to believe; drives the plausibility check.
  credited_play_s double precision not null default 0 check (credited_play_s >= 0),
  dino_time_s     bigint check (dino_time_s is null or dino_time_s >= 0),
  best_era        smallint not null default 1 check (best_era between 1 and 4),
  evolutions      integer not null default 0 check (evolutions >= 0),
  ended           boolean not null default false,
  flagged         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists scores_lifetime_idx on public.scores (lifetime_log10 desc) where not flagged;
create index if not exists scores_dino_idx on public.scores (dino_time_s asc) where dino_time_s is not null and not flagged;

alter table public.scores enable row level security;
-- No policies: with RLS on and no grants, the table is reachable only through the functions below.
revoke all on table public.scores from anon, authenticated;

-- Highest plausible log10(lifetime damage) after `hours` of credited play.
create or replace function public.max_plausible_log10(hours double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 6 + 8 * power(greatest(hours, 0), 0.75);
$$;

create or replace function public.submit_score(
  p_nickname       text,
  p_lifetime_log10 double precision,
  p_play_time_s    bigint,
  p_dino_time_s    bigint,
  p_best_era       smallint,
  p_evolutions     integer,
  p_ended          boolean
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
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if char_length(nick) < 1 or char_length(nick) > 20 or nick ~ '[[:cntrl:]]' then
    raise exception 'invalid nickname' using errcode = '22023';
  end if;
  if p_lifetime_log10 is null or p_lifetime_log10 = 'NaN'::double precision
     or p_lifetime_log10 < 0 or p_lifetime_log10 > 1000000 then
    raise exception 'invalid score' using errcode = '22023';
  end if;
  if p_play_time_s is null or p_play_time_s < 0
     or p_best_era is null or p_best_era not between 1 and 4
     or p_evolutions is null or p_evolutions < 0 then
    raise exception 'invalid progress' using errcode = '22023';
  end if;
  if p_dino_time_s is not null and (p_dino_time_s < 1800 or p_dino_time_s > p_play_time_s) then
    raise exception 'implausible dino time' using errcode = '22023';
  end if;

  select * into prev from public.scores where player_id = uid for update;

  if not found then
    -- A brand-new player gets at most an hour of credit for progress made before first contact.
    credited := least(p_play_time_s, 3600);
    if p_lifetime_log10 > public.max_plausible_log10(credited / 3600.0) then
      raise exception 'implausible score' using errcode = '22023';
    end if;
    insert into public.scores (player_id, nickname, lifetime_log10, play_time_s, credited_play_s,
                               dino_time_s, best_era, evolutions, ended)
    values (uid, nick, p_lifetime_log10, p_play_time_s, credited,
            p_dino_time_s, p_best_era, p_evolutions, coalesce(p_ended, false));
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
  credited := prev.credited_play_s
              + greatest(0, least(p_play_time_s - prev.play_time_s, elapsed + 60));
  if p_play_time_s < prev.play_time_s then
    -- The player started a new save. Keep the credit already earned.
    credited := prev.credited_play_s;
  end if;

  if p_lifetime_log10 > public.max_plausible_log10(credited / 3600.0) then
    raise exception 'implausible score' using errcode = '22023';
  end if;

  update public.scores
     set nickname        = nick,
         lifetime_log10  = greatest(prev.lifetime_log10, p_lifetime_log10),
         play_time_s     = p_play_time_s,
         credited_play_s = credited,
         dino_time_s     = case
                             when prev.dino_time_s is null then p_dino_time_s
                             when p_dino_time_s is null then prev.dino_time_s
                             else least(prev.dino_time_s, p_dino_time_s)
                           end,
         best_era        = greatest(prev.best_era, p_best_era),
         evolutions      = greatest(prev.evolutions, p_evolutions),
         ended           = prev.ended or coalesce(p_ended, false),
         updated_at      = now()
   where player_id = uid;
end;
$$;

-- Top N by lifetime damage, plus the caller's own row wherever it ranks.
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
   where r.rank <= least(greatest(coalesce(p_limit, 50), 1), 100)
      or r.player_id = auth.uid()
   order by r.rank;
$$;

-- Top N by time to reach the dinosaur era (seconds, lower is better).
create or replace function public.leaderboard_speedrun(p_limit integer default 50)
returns table (rank bigint, nickname text, value double precision, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select s.player_id, s.nickname, s.dino_time_s::double precision as value,
           rank() over (order by s.dino_time_s asc, s.created_at asc) as rank
      from public.scores s
     where not s.flagged and s.dino_time_s is not null
  )
  select r.rank, r.nickname, r.value, coalesce(r.player_id = auth.uid(), false)
    from ranked r
   where r.rank <= least(greatest(coalesce(p_limit, 50), 1), 100)
      or r.player_id = auth.uid()
   order by r.rank;
$$;

revoke all on function public.submit_score(text, double precision, bigint, bigint, smallint, integer, boolean) from public;
revoke all on function public.leaderboard_lifetime(integer) from public;
revoke all on function public.leaderboard_speedrun(integer) from public;
revoke all on function public.max_plausible_log10(double precision) from public;

grant execute on function public.submit_score(text, double precision, bigint, bigint, smallint, integer, boolean) to authenticated;
grant execute on function public.leaderboard_lifetime(integer) to anon, authenticated;
grant execute on function public.leaderboard_speedrun(integer) to anon, authenticated;
