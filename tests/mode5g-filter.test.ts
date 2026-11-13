import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {openDatabase} from '../server/database.ts';
import {getTowers} from '../server/query.ts';
import {createApp} from '../server/app.ts';

function fixture() {
  const db = openDatabase(':memory:');
  const insert = db.prepare("INSERT INTO towers(id,address,province,lat,lng,operators,source,addedBy,status) VALUES(?,?,'Mazowieckie',52.2,21.0,?,?,?,'APPROVED')");
  const ops = (name: string, ...bands: object[]) => JSON.stringify([{name, bands}]);
  // BTMap stations with a mode entered per cell.
  insert.run('btmap-sa', 'A', ops('Play', {tech: '5G', band: '3600', mode: 'SA'}), 'BTMAP', 'Anna');
  insert.run('btmap-nsa', 'B', ops('Orange', {tech: 'NR', band: '2100', mode: 'nsa'}), 'BTMAP', 'Anna');
  insert.run('btmap-both', 'C', ops('Plus', {tech: '5G', band: '3600', mode: 'SA'}, {tech: '5G', band: '700', mode: 'NSA'}), 'User', 'Anna');
  // BTMap station whose 5G cell has no recorded mode, and one without 5G.
  insert.run('btmap-unknown', 'D', ops('T-Mobile', {tech: '5G', band: '3600'}), 'BTMAP', 'Anna');
  insert.run('btmap-lte', 'E', ops('Play', {tech: 'LTE', band: '1800', mode: 'SA'}), 'BTMAP', 'Anna');
  // UKE registry stations: no mode in the registry. The old filter counted these as SA by band, or as NSA always.
  insert.run('uke-cband', 'F', ops('Play', {tech: '5G', band: '3600', permit: 'REJ/1/1/1/26 [P]'}), 'UKE', 'AutoSync BIP UKE');
  insert.run('uke-dss', 'G', ops('Orange', {tech: '5G', band: '2100', permit: 'REJ/1/2/1/26 [P]'}), 'UKE', 'AutoSync BIP UKE');
  // A registry row that somehow carries a mode is still registry data and stays out of the mode filter.
  insert.run('uke-with-mode', 'H', ops('Plus', {tech: '5G', band: '3600', mode: 'SA'}), 'UKE', 'AutoSync BIP UKE');
  return db;
}
const ids = (db: ReturnType<typeof openDatabase>, query: Record<string, unknown>) => getTowers(db, {limit: '100', ...query}).items.map(t => String(t.id)).sort();

test('the 5G mode filter only covers the BTMap database and only recorded modes', () => {
  const db = fixture();
  try {
    assert.deepEqual(ids(db, {modes5g: 'SA'}), ['btmap-both', 'btmap-sa']);
    assert.deepEqual(ids(db, {modes5g: 'NSA'}), ['btmap-both', 'btmap-nsa']);
    assert.deepEqual(ids(db, {modes5g: 'SA,NSA'}), ['btmap-both', 'btmap-nsa', 'btmap-sa'], 'both modes: 5G cells with any recorded mode, not every 5G station');
    assert.deepEqual(ids(db, {modes5g: 'SA', source: 'ALL'}), ['btmap-both', 'btmap-sa'], 'with all sources selected the registry still stays out');
    assert.deepEqual(ids(db, {modes5g: 'SA', source: 'UKE'}), [], 'the registry has no mode to filter by');
    assert.deepEqual(ids(db, {mode5g: 'sa'}), ['btmap-both', 'btmap-sa'], 'the legacy parameter name and lower case still work');

    // Combined with other filters on the same operator entry.
    assert.deepEqual(ids(db, {modes5g: 'SA', operators: 'Plus'}), ['btmap-both']);
    assert.deepEqual(ids(db, {modes5g: 'NSA', bands: '700'}), ['btmap-both']);

    // Unknown values are ignored instead of breaking the query or emptying the map.
    assert.equal(ids(db, {modes5g: 'XYZ'}).length, 8);
    assert.equal(ids(db, {}).length, 8);
  } finally { db.close(); }
});

test('a published 5G cell keeps the mode that was entered and is not assumed NSA', async () => {
  const db = openDatabase(':memory:');
  const server = createApp(db).listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as {port: number}).port}/api`;
  try {
    const registration = await fetch(`${base}/auth/register`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: 'mod@example.com', nick: 'Mod', password: 'long-password-123'})});
    const cookie = registration.headers.get('set-cookie')!.split(';')[0];
    db.prepare("UPDATE users SET role='ADMIN'").run();
    const cell = (extra: object) => ({tech: '5G', band: 'n78', pci: 10, earfcn: 645000, cellId: 1, nodeId: 1234, ...extra});
    const submit = await fetch(`${base}/submit`, {method: 'POST', headers: {'Content-Type': 'application/json', cookie}, body: JSON.stringify({type: 'NEW_STATION', data: {
      operator: 'Play', stationId: 'WAW5G', address: 'Warszawa, Testowa 5', province: 'Mazowieckie', lat: 52.21, lng: 21.01,
      cells: [cell({mode: 'SA'}), cell({pci: 11, cellId: 2}), cell({pci: 12, cellId: 3, mode: 'cokolwiek'})],
    }})});
    const body = await submit.json();
    assert.equal(submit.status, 201, JSON.stringify(body));
    const bands = JSON.parse(String(db.prepare('SELECT operators FROM towers WHERE id=?').get(body.towerId)!.operators))[0].bands;
    assert.deepEqual(bands.map((b: {mode?: string}) => b.mode ?? null), ['SA', null, null]);
    assert.deepEqual(ids(db, {modes5g: 'NSA'}), [], 'cells without a mode are not counted as NSA');
    assert.deepEqual(ids(db, {modes5g: 'SA'}), [body.towerId]);
  } finally { await new Promise<void>(done => server.close(() => done())); db.close(); }
});
