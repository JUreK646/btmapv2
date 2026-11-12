import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import {openDatabase} from '../server/database.ts';
import {getTowers} from '../server/query.ts';
import {createApp} from '../server/app.ts';

async function withServer(run: (ctx: {db: DatabaseSync; client: () => Promise<{id: string; call: (method: string, path: string, body?: unknown) => Promise<Response>}>}) => Promise<void>) {
  const db = openDatabase(':memory:');
  db.prepare("INSERT INTO towers(id,stationId,address,province,lat,lng,operators,source,status) VALUES('community','C1','Kraków, Długa 1','Małopolskie',50.06,19.94,'[]','BTMAP','APPROVED')").run();
  const server = createApp(db).listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as {port: number}).port}/api`;
  let accounts = 0;
  // Each client is a separate registered account with its own session cookie.
  const client = async () => {
    const n = ++accounts;
    const registration = await fetch(`${base}/auth/register`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: `user${n}@example.com`, nick: `User${n}`, password: 'long-password-123'})});
    assert.equal(registration.status, 201);
    const cookie = registration.headers.get('set-cookie')!.split(';')[0];
    const id = (await registration.json() as {id: string}).id;
    return {id, call: (method: string, path: string, body?: unknown) => fetch(base + path, {method, headers: {'Content-Type': 'application/json', cookie}, body: body === undefined ? undefined : JSON.stringify(body)})};
  };
  try { await run({db, client}); } finally { await new Promise<void>(done => server.close(() => done())); db.close(); }
}

test('an approved station keeps the cell identity that was submitted', async () => {
  await withServer(async ({db, client}) => {
    const user = await client();
    const cells = [
      {tech: 'LTE', band: 'b3', pci: 100, earfcn: 1374, nodeId: 438211, cellId: 2, tac: 58100, bandwidth: 20, azimuth: 120},
      {tech: 'LTE', band: 'b3', pci: 101, earfcn: 1374, nodeId: '438211', cellId: '3', lac: '', azimuth: 240},
    ];
    const submitted = await user.call('POST', '/submit', {type: 'NEW_STATION', data: {operator: 'Play', stationId: 'WAW1234', address: 'Warszawa, Testowa 1', province: 'Mazowieckie', lat: 52.2, lng: 21.0, cells}});
    assert.equal(submitted.status, 201);
    db.prepare("UPDATE users SET role='ADMIN' WHERE id=?").run(user.id);
    const approved = await user.call('POST', '/admin/moderate', {id: (await submitted.json()).id, action: 'APPROVE'});
    assert.equal(approved.status, 200);
    const towerId = (await approved.json()).towerId as string;

    const bands = JSON.parse(String(db.prepare('SELECT operators FROM towers WHERE id=?').get(towerId)!.operators))[0].bands;
    assert.deepEqual(bands.map((b: Record<string, unknown>) => [b.nodeId, b.cellId, b.tac, b.bandwidth, b.pci]), [[438211, 2, 58100, 20, 100], [438211, 3, undefined, undefined, 101]]);
    assert.ok(!('lac' in bands[1]), 'empty optional fields are left out, not stored as 0');
    // Which is what makes the station findable by its eNB id.
    assert.ok(getTowers(db, {q: '438211', source: 'BTMAP'}).items.some(t => t.id === towerId));
  });
});

test('comments are limited per account, so points and photo storage cannot be farmed', async () => {
  await withServer(async ({db, client}) => {
    const spammer = await client(), other = await client();
    for (let i = 0; i < 20; i++) assert.equal((await spammer.call('POST', '/towers/community/comments', {text: `Komentarz ${i}`})).status, 201);
    const blocked = await spammer.call('POST', '/towers/community/comments', {text: 'Jeszcze jeden'});
    assert.equal(blocked.status, 429);
    assert.match((await blocked.json()).error, /Za dużo prób/);
    assert.equal(db.prepare('SELECT points FROM users WHERE id=?').get(spammer.id)!.points, 100);
    assert.equal(Number(db.prepare("SELECT COUNT(*) AS count FROM comments WHERE userNick='User1'").get()!.count), 20);
    // Another account from the same address is not affected.
    assert.equal((await other.call('POST', '/towers/community/comments', {text: 'Pierwszy komentarz'})).status, 201);
  });
});

test('submissions and the analysis endpoints are rate limited', async () => {
  await withServer(async ({client}) => {
    const user = await client();
    // Invalid requests are answered before any work or upstream call happens, but still count.
    for (let i = 0; i < 30; i++) assert.equal((await user.call('POST', '/submit', {type: 'UNKNOWN', data: {}})).status, 400);
    assert.equal((await user.call('POST', '/submit', {type: 'UNKNOWN', data: {}})).status, 429);

    for (let i = 0; i < 30; i++) assert.equal((await user.call('GET', '/area-evaluation?lat=0&lng=0')).status, 400);
    assert.equal((await user.call('GET', '/area-evaluation?lat=0&lng=0')).status, 429);
    assert.equal((await user.call('POST', '/area-evaluation', {centerLat: 0, centerLng: 0})).status, 429, 'GET and POST share one budget');

    for (let i = 0; i < 120; i++) assert.equal((await user.call('GET', '/terrain-profile?lat1=x')).status, 400);
    assert.equal((await user.call('GET', '/terrain-profile?lat1=x')).status, 429);
    // Reading the map is not limited by any of this.
    assert.equal((await user.call('GET', '/towers?limit=1')).status, 200);
  });
});

const guards = pathToFileURL(resolve('server', 'processGuards.ts')).href;
const runScript = (code: string) => spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', code], {encoding: 'utf8', timeout: 20000});

test('an uncaught exception shuts the server down instead of leaving it running in an unknown state', () => {
  const crash = runScript(`
    import {installProcessGuards} from '${guards}';
    installProcessGuards(() => console.log('released'), 3000);
    setInterval(() => console.log('still serving'), 150);
    setTimeout(() => { throw new Error('boom'); }, 20);
  `);
  assert.equal(crash.status, 1);
  assert.match(crash.stdout, /released/);
  assert.doesNotMatch(crash.stdout, /still serving/);
  assert.match(crash.stderr, /Uncaught Exception/);

  // A shutdown hook that never finishes cannot keep the broken process alive.
  const stuck = runScript(`
    import {installProcessGuards} from '${guards}';
    installProcessGuards(() => new Promise(() => {}), 200);
    setInterval(() => {}, 1000);
    setTimeout(() => { throw new Error('boom'); }, 20);
  `);
  assert.equal(stuck.status, 1);
});

test('a rejected background promise is logged and does not take the server down', () => {
  const result = runScript(`
    import {installProcessGuards} from '${guards}';
    installProcessGuards();
    Promise.reject(new Error('sync failed'));
    setTimeout(() => { console.log('still serving'); process.exit(0); }, 150);
  `);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /still serving/);
  assert.match(result.stderr, /Unhandled Rejection/);
});
