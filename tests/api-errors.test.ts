import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {openDatabase} from '../server/database.ts';
import {getTowers} from '../server/query.ts';
import {computeGrowthCounters} from '../server/stats.ts';
import {createApp} from '../server/app.ts';

test('server faults are answered with a fixed message and bad input with a 4xx', async () => {
  const db = openDatabase(':memory:');
  db.prepare("INSERT INTO towers(id,stationId,address,province,lat,lng,operators,source,status) VALUES('community','C1','Kraków','Małopolskie',50.06,19.94,'[]','BTMAP','APPROVED')").run();
  const server = createApp(db).listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as {port: number}).port}/api`;
  const errors: unknown[][] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.version, JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version, 'the version comes from package.json');

    // An unparsable Origin is refused, not turned into a crash.
    for (const origin of ['null', 'not a url']) {
      const response = await fetch(`${base}/auth/login`, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: origin}, body: '{}'});
      assert.equal(response.status, 403);
    }

    const registration = await fetch(`${base}/auth/register`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: 'a@example.com', nick: 'Anna', password: 'long-password-123'})});
    const cookie = registration.headers.get('set-cookie')!.split(';')[0];
    const notAnImage = await fetch(`${base}/towers/community/comments`, {method: 'POST', headers: {'Content-Type': 'application/json', cookie}, body: JSON.stringify({text: 'zdjęcie', imageBase64: Buffer.from('to nie jest obraz').toString('base64')})});
    assert.equal(notAnImage.status, 400);
    assert.match((await notAnImage.json()).error, /Nie udało się odczytać zdjęcia/);
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS c FROM comments').get()!.c), 0, 'nothing is saved for a rejected photo');
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS c FROM photos').get()!.c), 0);

    // A real server fault: the table the statistics read is gone.
    db.exec('DROP TABLE radiolines');
    const broken = await fetch(`${base}/stats?source=UKE`);
    assert.equal(broken.status, 500);
    const body = await broken.text();
    assert.deepEqual(JSON.parse(body), {error: 'Błąd pobierania statystyk.'});
    assert.doesNotMatch(body, /radiolines|no such table|SELECT/i, 'internal details stay out of the response');
    assert.ok(errors.some(args => args.some(arg => /no such table/i.test(String((arg as Error)?.message ?? arg)))), 'but they are logged');
  } finally {
    console.error = realError;
    await new Promise<void>(done => server.close(() => done())); db.close();
  }
});

test('KML-imported registry stations filed under BTMap are moved back to UKE on startup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'btmap-kml-'));
  const file = join(dir, 'db.sqlite');
  try {
    let db = openDatabase(file);
    const insert = db.prepare("INSERT INTO towers(id,address,province,lat,lng,operators,source,addedBy,status) VALUES(?,'A','Mazowieckie',52.2,21.0,'[]',?,?,'APPROVED')");
    insert.run('UKE_kml', 'BTMAP', 'Import KML');
    insert.run('community', 'BTMAP', 'Anna');
    // A database migrated by the earlier rule, before this fix.
    db.prepare("DELETE FROM metadata WHERE key='kmlIsUkeRegistryV4'").run();
    db.close();

    db = openDatabase(file);
    const source = (id: string) => String(db.prepare('SELECT source FROM towers WHERE id=?').get(id)!.source);
    assert.equal(source('UKE_kml'), 'UKE');
    assert.equal(source('community'), 'BTMAP', 'real community stations stay in BTMap');
    assert.deepEqual(getTowers(db, {source: 'BTMAP'}).items.map(t => t.id), ['community']);
    db.close();
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('the UKE view is defined by registry data, not by the year in a permit number', () => {
  const db = openDatabase(':memory:');
  try {
    const insert = db.prepare("INSERT INTO towers(id,address,province,lat,lng,operators,source,addedBy,status) VALUES(?,?,'Mazowieckie',52.2,21.0,?,?,?,'APPROVED')");
    const ops = (name: string, permit?: string) => JSON.stringify([{name, bands: [{tech: 'LTE', band: '1800', ...(permit === undefined ? {} : {permit})}]}]);
    insert.run('registry', 'A', ops('Orange', 'REJ/1/1/1/26 [P]'), 'UKE', 'AutoSync BIP UKE');
    insert.run('kml', 'B', ops('Play', ''), 'UKE', 'Import KML');
    // A community record carrying a permit from another year used to fall out of the UKE view.
    insert.run('older-permit', 'C', ops('T-Mobile', 'UMTS/2/0001/3/19 [zmP]'), 'BTMAP', 'Anna');
    insert.run('next-year', 'D', ops('Play', 'REJ/1/2/1/27 [P]'), 'BTMAP', 'Anna');
    // Community records without any permit are not registry data, whichever operator they name.
    insert.run('community-plus', 'E', ops('Plus'), 'BTMAP', 'Anna');
    insert.run('community-empty-permit', 'F', ops('Orange', ''), 'BTMAP', 'Anna');

    const ids = (source: string) => getTowers(db, {source, limit: '100'}).items.map(t => String(t.id)).sort();
    assert.deepEqual(ids('UKE'), ['kml', 'next-year', 'older-permit', 'registry']);
    assert.deepEqual(ids('BTMAP'), ['community-empty-permit', 'community-plus', 'next-year', 'older-permit']);
    assert.equal(ids('ALL').length, 6);

    const counters = computeGrowthCounters(db, 'UKE');
    assert.equal(counters.totals.stations, 4);
    assert.equal(counters.stations.Plus, undefined, 'a Plus record without a permit is not counted as registry data');
  } finally { db.close(); }
});

test('the deployment serves compressed, cacheable assets and reports API health', () => {
  const nginx = readFileSync(resolve('nginx.conf'), 'utf8');
  assert.match(nginx, /^\s*gzip on;/m);
  assert.match(nginx, /gzip_types[^;]*application\/javascript[^;]*application\/json/);
  assert.match(nginx, /location \/assets\/ \{[^}]*max-age=31536000, immutable/s);
  assert.match(nginx, /location \/ \{[^}]*Cache-Control "no-cache"/s);
  assert.match(nginx, /X-Content-Type-Options "nosniff" always/);
  assert.match(nginx, /X-Frame-Options "SAMEORIGIN" always/);

  const dockerfile = readFileSync(resolve('Dockerfile'), 'utf8');
  assert.match(dockerfile, /COPY public \.\/public/, 'logos and icons in public/ must reach the web image');
  assert.match(dockerfile, /pnpm install --frozen-lockfile --prod/);
  assert.match(dockerfile, /COPY --from=production-dependencies \/app\/node_modules/);
  assert.match(dockerfile, /HEALTHCHECK[\s\S]*\/api\/health/);
  // Everything the API imports at runtime must be a production dependency.
  const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
  for (const name of ['express', 'bcryptjs', 'sharp', 'read-excel-file', 'pdfjs-dist']) assert.ok(pkg.dependencies[name], `${name} must be in dependencies`);
});
