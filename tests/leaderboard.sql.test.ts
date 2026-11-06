import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  new URL('../supabase/migrations/20261106000000_leaderboard.sql', import.meta.url),
  'utf8',
);

const ALICE = '00000000-0000-4000-8000-000000000001';
const BOB = '00000000-0000-4000-8000-000000000002';
const CAROL = '00000000-0000-4000-8000-000000000003';

let db: PGlite;

/** Run as a signed-in player: auth.uid() reads the JWT subject, as on Supabase. */
async function as<T>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  const res = await db.query<T>(sql, params);
  return res.rows;
}

const submit = (
  uid: string,
  o: { name?: string; log10: number; play: number; dino?: number | null; era?: number; evo?: number; ended?: boolean },
) =>
  as(uid, `select public.submit_score($1, $2, $3, $4, $5::smallint, $6, $7)`, [
    o.name ?? 'tester',
    o.log10,
    o.play,
    o.dino ?? null,
    o.era ?? 1,
    o.evo ?? 0,
    o.ended ?? false,
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
}, 60_000);

describe('leaderboard SQL', () => {
  it('rejects anonymous callers', async () => {
    await expect(submit(null as unknown as string, { log10: 1, play: 10 })).rejects.toThrow(/not authenticated/);
  });

  it('inserts a first score and ranks players', async () => {
    await submit(ALICE, { name: '记仇的蚊子#0001', log10: 5, play: 900 });
    await submit(BOB, { name: '在逃的章鱼#0002', log10: 7, play: 1800 });
    const rows = await as<{ rank: number; nickname: string; is_me: boolean }>(ALICE, 'select * from public.leaderboard_lifetime(10)');
    expect(rows.map((r) => r.nickname)).toEqual(['在逃的章鱼#0002', '记仇的蚊子#0001']);
    expect(rows[1]!.is_me).toBe(true);
    expect(Number(rows[0]!.rank)).toBe(1);
  });

  it('rate-limits updates but still lets a nickname change through', async () => {
    await submit(ALICE, { name: '新名字', log10: 6, play: 950 });
    const [row] = await db.query<{ nickname: string; lifetime_log10: number }>(
      `select nickname, lifetime_log10 from public.scores where player_id = $1`,
      [ALICE],
    ).then((r) => r.rows);
    expect(row!.nickname).toBe('新名字');
    expect(row!.lifetime_log10).toBe(5);
  });

  it('never credits play time faster than the wall clock', async () => {
    await age(ALICE, 60);
    // Claims ten extra hours after one real minute: only ~2 minutes are credited.
    await submit(ALICE, { log10: 6, play: 950 + 36_000 });
    const [row] = (await db.query<{ credited_play_s: number }>(`select credited_play_s from public.scores where player_id = $1`, [ALICE])).rows;
    expect(row!.credited_play_s).toBeLessThan(900 + 130);
    // ...so a huge score is refused even though the claimed play time would allow it.
    await age(ALICE, 60);
    await expect(submit(ALICE, { log10: 40, play: 950 + 36_100 })).rejects.toThrow(/implausible score/);
  });

  it('refuses edited saves on first contact', async () => {
    await expect(submit(CAROL, { log10: 120, play: 999_999 })).rejects.toThrow(/implausible score/);
  });

  it('keeps the best lifetime and the fastest dino time', async () => {
    await age(BOB, 7200);
    await submit(BOB, { log10: 18, play: 1800 + 7000, dino: 5400, era: 4 });
    await age(BOB, 60);
    await submit(BOB, { log10: 12, play: 1800 + 7050, dino: 6000, era: 4 });
    const [row] = (await db.query<{ lifetime_log10: number; dino_time_s: number; best_era: number }>(
      `select lifetime_log10, dino_time_s, best_era from public.scores where player_id = $1`,
      [BOB],
    )).rows;
    expect(row!.lifetime_log10).toBe(18);
    expect(Number(row!.dino_time_s)).toBe(5400);
    expect(row!.best_era).toBe(4);
    const speed = await as<{ nickname: string; value: number }>(CAROL, 'select * from public.leaderboard_speedrun(10)');
    expect(speed).toHaveLength(1);
    expect(speed[0]!.value).toBe(5400);
  });

  it('rejects impossible dino times and bad input', async () => {
    await age(BOB, 60);
    await expect(submit(BOB, { log10: 18, play: 9000, dino: 60, era: 4 })).rejects.toThrow(/dino/);
    await expect(submit(BOB, { name: '', log10: 1, play: 9000 })).rejects.toThrow(/nickname/);
    await expect(submit(BOB, { name: 'x'.repeat(21), log10: 1, play: 9000 })).rejects.toThrow(/nickname/);
    await expect(submit(BOB, { log10: -1, play: 9000 })).rejects.toThrow(/invalid score/);
  });

  it('blocks direct table access for client roles', async () => {
    await db.exec('set role authenticated');
    await expect(db.query('select * from public.scores')).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
  });

  it('plausibility curve stays above the fastest simulated player', async () => {
    const [row] = (await db.query<{ v: number }>('select public.max_plausible_log10(10.6) as v')).rows;
    expect(row!.v).toBeGreaterThan(30);
  });
});
