import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(new URL('../supabase/migrations/20261106000000_leaderboard.sql', import.meta.url), 'utf8');
const TERRITORY = readFileSync(new URL('../supabase/migrations/20261108000000_territory_board.sql', import.meta.url), 'utf8');

const ALICE = '00000000-0000-4000-8000-000000000001';
const BOB = '00000000-0000-4000-8000-000000000002';
const CAROL = '00000000-0000-4000-8000-000000000003';

let db: PGlite;

/** Run as a signed-in player: auth.uid() reads the JWT subject, as on Supabase. */
async function as<T>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  return (await db.query<T>(sql, params)).rows;
}

interface Submit {
  name?: string;
  life: number;
  best?: number;
  play: number;
  runs?: number;
  wins?: number;
  normal?: number | null;
  hard?: number | null;
}

const submit = (uid: string | null, o: Submit) =>
  as(uid, `select public.submit_score($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
    o.name ?? 'tester',
    o.life,
    o.best ?? Math.min(o.life, 1),
    o.play,
    o.runs ?? 0,
    o.wins ?? 0,
    o.normal ?? null,
    o.hard ?? null,
    null,
  ]);

/** Pretend the player's last update happened `seconds` ago. */
const age = (uid: string, seconds: number) =>
  db.query(`update public.scores set updated_at = now() - make_interval(secs => $2) where player_id = $1`, [uid, seconds]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    insert into auth.users (id) values ('${ALICE}'), ('${BOB}'), ('${CAROL}');
  `);
  await db.exec(MIGRATION);
  await db.exec(TERRITORY);
}, 60_000);

describe('leaderboard SQL', () => {
  it('rejects anonymous callers', async () => {
    await expect(submit(null, { life: 1, play: 10 })).rejects.toThrow(/not authenticated/);
  });

  it('inserts first scores and ranks players', async () => {
    await submit(ALICE, { name: '记仇的蚊子#0001', life: 8, best: 8, play: 900, runs: 1 });
    await submit(BOB, { name: '在逃的章鱼#0002', life: 12, best: 12, play: 1800, runs: 1 });
    const rows = await as<{ rank: number; nickname: string; is_me: boolean }>(ALICE, 'select * from public.leaderboard_lifetime(10)');
    expect(rows.map((r) => r.nickname)).toEqual(['在逃的章鱼#0002', '记仇的蚊子#0001']);
    expect(rows[1]!.is_me).toBe(true);
    const best = await as<{ nickname: string }>(ALICE, 'select * from public.leaderboard_best(10)');
    expect(best[0]!.nickname).toBe('在逃的章鱼#0002');
  });

  it('rate-limits updates but still lets a nickname change through', async () => {
    await submit(ALICE, { name: '新名字', life: 9, play: 950, runs: 1 });
    const [row] = (await db.query<{ nickname: string; lifetime_log10: number }>(
      `select nickname, lifetime_log10 from public.scores where player_id = $1`,
      [ALICE],
    )).rows;
    expect(row!.nickname).toBe('新名字');
    expect(row!.lifetime_log10).toBe(8);
  });

  it('never credits play time faster than the wall clock', async () => {
    await age(ALICE, 60);
    await submit(ALICE, { life: 9, play: 950 + 36_000, runs: 1 });
    const [row] = (await db.query<{ credited_play_s: number }>(`select credited_play_s from public.scores where player_id = $1`, [ALICE])).rows;
    expect(row!.credited_play_s).toBeLessThan(900 + 130);
    await age(ALICE, 60);
    await expect(submit(ALICE, { life: 200, play: 950 + 36_100, runs: 1 })).rejects.toThrow(/implausible score/);
  });

  it('refuses edited saves on first contact', async () => {
    await expect(submit(CAROL, { life: 400, play: 999_999 })).rejects.toThrow(/implausible score/);
  });

  it('keeps the best values and the fastest win per difficulty', async () => {
    await age(BOB, 7200);
    await submit(BOB, { life: 21, best: 21, play: 1800 + 3600, runs: 2, wins: 1, normal: 3100 });
    await age(BOB, 60);
    await submit(BOB, { life: 21.2, best: 20, play: 1800 + 3650, runs: 3, wins: 2, normal: 3400, hard: 3600 });
    const [row] = (await db.query<{ best_run_log10: number; fastest_normal_s: number; fastest_hard_s: number; wins: number }>(
      `select best_run_log10, fastest_normal_s, fastest_hard_s, wins from public.scores where player_id = $1`,
      [BOB],
    )).rows;
    expect(row!.best_run_log10).toBe(21);
    expect(row!.fastest_normal_s).toBe(3100);
    expect(row!.fastest_hard_s).toBe(3600);
    expect(row!.wins).toBe(2);
    const fast = await as<{ value: number }>(CAROL, `select * from public.leaderboard_fastest('normal', 10)`);
    expect(fast).toHaveLength(1);
    expect(fast[0]!.value).toBe(3100);
    expect(await as(CAROL, `select * from public.leaderboard_fastest('brutal', 10)`)).toHaveLength(0);
  });

  it('rejects impossible wins and bad input', async () => {
    await age(BOB, 60);
    await expect(submit(BOB, { life: 21, play: 9000, runs: 3, wins: 2, normal: 300 })).rejects.toThrow(/win time/);
    await expect(submit(BOB, { life: 21, play: 9000, runs: 3, wins: 0, normal: 3000 })).rejects.toThrow(/win time/);
    await expect(submit(BOB, { life: 21, play: 9000, runs: 1, wins: 2 })).rejects.toThrow(/invalid progress/);
    await expect(submit(BOB, { life: 5, best: 9, play: 9000 })).rejects.toThrow(/invalid score/);
    await expect(submit(BOB, { name: '', life: 1, play: 9000 })).rejects.toThrow(/nickname/);
    await expect(submit(BOB, { name: 'x'.repeat(21), life: 1, play: 9000 })).rejects.toThrow(/nickname/);
  });

  it('blocks direct table access for client roles', async () => {
    await db.exec('set role authenticated');
    await expect(db.query('select * from public.scores')).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
  });

  it('plausibility curve stays above the fastest simulated runs', async () => {
    // A 1e23 bill in about 34 minutes, the fastest the bots manage.
    const [row] = (await db.query<{ v: number }>('select public.max_plausible_log10(34 / 60.0) as v')).rows;
    expect(row!.v).toBeGreaterThan(23);
  });
});

interface Territory {
  name?: string;
  best: number;
  play: number;
  runs?: number;
  wins?: number;
  normal?: number | null;
}

const claim = (uid: string | null, o: Territory) =>
  as(uid, `select public.submit_territory($1, $2, $3, $4, $5, $6, $7, $8)`, [
    o.name ?? 'tester',
    o.best,
    o.play,
    o.runs ?? 0,
    o.wins ?? 0,
    o.normal ?? null,
    null,
    null,
  ]);

const ageTerritory = (uid: string, seconds: number) =>
  db.query(`update public.territory_scores set updated_at = now() - make_interval(secs => $2) where player_id = $1`, [uid, seconds]);

describe('territory leaderboard SQL', () => {
  it('rejects anonymous callers', async () => {
    await expect(claim(null, { best: 12, play: 10 })).rejects.toThrow(/not authenticated/);
  });

  it('ranks players by the best share they held', async () => {
    await claim(ALICE, { name: '记仇的蚊子#0001', best: 30.5, play: 900, runs: 1 });
    await claim(BOB, { name: '在逃的章鱼#0002', best: 48, play: 1800, runs: 1 });
    const rows = await as<{ nickname: string; value: number; is_me: boolean }>(ALICE, 'select * from public.territory_best(10)');
    expect(rows.map((r) => r.nickname)).toEqual(['在逃的章鱼#0002', '记仇的蚊子#0001']);
    expect(rows[1]!.is_me).toBe(true);
    expect(rows[0]!.value).toBe(48);
  });

  it('keeps the best share and the fastest win', async () => {
    await ageTerritory(BOB, 7200);
    await claim(BOB, { best: 72, play: 1800 + 3600, runs: 2, wins: 1, normal: 2700 });
    await ageTerritory(BOB, 60);
    await claim(BOB, { best: 50, play: 1800 + 3650, runs: 3, wins: 2, normal: 3000 });
    const [row] = (await db.query<{ best_territory: number; fastest_normal_s: number }>(
      `select best_territory, fastest_normal_s from public.territory_scores where player_id = $1`,
      [BOB],
    )).rows;
    expect(row!.best_territory).toBe(72);
    expect(row!.fastest_normal_s).toBe(2700);
    const fast = await as<{ value: number }>(CAROL, `select * from public.territory_fastest('normal', 10)`);
    expect(fast[0]!.value).toBe(2700);
  });

  it('refuses shares no play could reach, impossible wins and bad input', async () => {
    await expect(claim(CAROL, { best: 95, play: 120 })).rejects.toThrow(/implausible score/);
    await expect(claim(CAROL, { best: 101, play: 9000 })).rejects.toThrow(/invalid score/);
    await expect(claim(CAROL, { best: 40, play: 9000, runs: 1, wins: 1, normal: 300 })).rejects.toThrow(/win time/);
    await expect(claim(CAROL, { best: 40, play: 9000, runs: 1, wins: 2 })).rejects.toThrow(/invalid progress/);
  });

  it('blocks direct table access for client roles', async () => {
    await db.exec('set role authenticated');
    await expect(db.query('select * from public.territory_scores')).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
  });
});
