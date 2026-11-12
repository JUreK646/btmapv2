import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/database.ts';
import {createPemPlansService} from '../server/pemPlans.ts';
import {createSi2pemSync} from '../server/si2pemSync.ts';

const plDate = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
const entry = (id: number, dateTo: Date, extra: Record<string, unknown> = {}) => ({
  id,
  base_station: {identity_name: `ST${id}`, operator: 'Orange Polska S.A.', latitude: '52.234444', longitude: '21.014444', address: 'Plac 2', city: 'Warszawa', voivodeship: 'mazowieckie'},
  lab: {name: 'Laboratorium', PCA: 'AB 419'},
  date_from: plDate(new Date(dateTo.getTime() - 2 * 86400000)), date_to: plDate(dateTo), status: 'PLANNED', report: null, ...extra,
});
type Kind = 'current' | 'expired' | 'rejected';
/** A fake schedule API: each page holds 100 entries of one kind. */
function api(now: Date, pages: Kind[]) {
  const calls: number[] = [];
  const upcoming = new Date(now.getTime() + 3 * 86400000), old = new Date(now.getTime() - 60 * 86400000);
  const fetcher = (async (url: unknown) => {
    const page = Number(new URL(String(url)).searchParams.get('page'));
    calls.push(page);
    const kind = pages[page - 1];
    const results = Array.from({length: 100}, (_, i) => {
      const id = (page - 1) * 100 + i + 1;
      return kind === 'current' ? entry(id, upcoming) : kind === 'expired' ? entry(id, old) : entry(id, upcoming, {status: 'CANCELED'});
    });
    return Response.json({count: pages.length * 100, results: kind ? results : []});
  }) as typeof fetch;
  return {fetcher, calls};
}
const area = {minLat: 52, maxLat: 53, minLng: 20, maxLng: 22};
const now = new Date('2026-10-19T10:00:00Z');

test('the schedule download stops once it has reached entries that are only expired', async () => {
  const db = openDatabase(':memory:');
  try {
    const {fetcher, calls} = api(now, ['current', 'expired', 'expired', 'expired', 'expired', 'expired', 'expired', 'expired']);
    const service = createPemPlansService(db, fetcher, () => now);
    await service.sync();
    assert.deepEqual(calls, [1, 2, 3], 'the older pages are not downloaded');
    assert.equal(service.query(area).total, 100);
  } finally { db.close(); }
});

test('pages of entries rejected for other reasons do not end the download early', async () => {
  const db = openDatabase(':memory:');
  try {
    // Two full pages of cancelled, still-dated entries sit between pages of valid ones.
    const {fetcher, calls} = api(now, ['current', 'rejected', 'rejected', 'current', 'expired', 'expired', 'expired']);
    const service = createPemPlansService(db, fetcher, () => now);
    await service.sync();
    assert.deepEqual(calls, [1, 2, 3, 4, 5, 6]);
    assert.equal(service.query(area).total, 200, 'the valid page after the cancelled ones is imported');
  } finally { db.close(); }
});

test('if the list no longer starts with current entries every page is read, so saved data is not wiped', async () => {
  const db = openDatabase(':memory:');
  try {
    const first = api(now, ['current', 'expired', 'expired']);
    const service = createPemPlansService(db, first.fetcher, () => now);
    await service.sync();
    assert.equal(service.query(area).total, 100);

    // The source starts returning the oldest entries first.
    const later = new Date(now.getTime() + 3 * 86400000);
    const flipped = api(later, ['expired', 'expired', 'expired', 'expired', 'current']);
    const again = createPemPlansService(db, flipped.fetcher, () => later);
    await again.sync();
    assert.deepEqual(flipped.calls, [1, 2, 3, 4, 5]);
    assert.equal(again.query(area).total, 100, 'the current entries at the end of the list are found');
  } finally { db.close(); }
});

test('a manual schedule sync reports failure to its caller and respects --force', async () => {
  const db = openDatabase(':memory:');
  try {
    const today = new Date();
    const working = api(today, ['current', 'expired', 'expired']);
    const sync = createSi2pemSync(db, working.fetcher);
    assert.equal(await sync.syncPlans(), true);
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS c FROM pem_plans').get()!.c), 100);

    // Fresh data: nothing is downloaded unless forced.
    working.calls.length = 0;
    assert.equal(await sync.syncPlans(), false);
    assert.deepEqual(working.calls, []);
    assert.equal(await sync.syncPlans(true), true);
    assert.deepEqual(working.calls, [1, 2, 3]);

    // The source is down: the caller gets the error (the CLI exits with 1) and the saved schedule stays.
    const down = createSi2pemSync(db, (async () => new Response('unavailable', {status: 503})) as typeof fetch);
    await assert.rejects(down.syncPlans(true), /HTTP 503/);
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS c FROM pem_plans').get()!.c), 100);
    assert.ok(db.prepare("SELECT value FROM metadata WHERE key='pemPlansError'").get()!.value);
  } finally { db.close(); }
});
