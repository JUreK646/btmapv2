import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/database.ts';
import {getTowers} from '../server/query.ts';
import {getCachedPdfAzimuths, resolveTowerAzimuths, withAzimuths} from '../server/azimuths.ts';
import type {Tower} from '../src/types.ts';

const tower = (overrides: Partial<Tower> = {}): Tower => ({
  id: 'UKE_abc', stationId: 'BT12345', address: 'Warszawa', province: 'Mazowieckie', lat: 52.2, lng: 21.0, source: 'UKE',
  operators: [{name: 'Play', stationIds: ['BT12345'], bands: [{tech: 'LTE', band: '1800'}]}],
  ...overrides,
});
const none = new Map<string, number[]>();

test('a station without any azimuth source gets none - directions are never made up', () => {
  for (const id of ['BT12345', 'BT99999', 'KRA0001', 'X']) {
    assert.deepEqual(resolveTowerAzimuths(tower({stationId: id, id: `UKE_${id}`, operators: [{name: 'Orange', stationIds: [id], bands: [{tech: '5G', band: '3600'}]}]}), none), {azimuths: [], source: 'unknown'});
  }
});

test('azimuths come from SI2PEM reports, verified ground truth or the station record, in that order of trust', () => {
  const pdf = new Map([['BT12345', [20, 140, 260]]]);
  assert.deepEqual(resolveTowerAzimuths(tower(), pdf), {azimuths: [20, 140, 260], source: 'si2pem'});
  // The report can be filed under an operator's station id rather than the tower's own.
  assert.deepEqual(resolveTowerAzimuths(tower({stationId: undefined, operators: [{name: 'Play', stationIds: ['BT12345'], bands: []}]}), pdf).source, 'si2pem');

  assert.deepEqual(resolveTowerAzimuths(tower({stationId: '57263'}), new Map([['57263', [1, 2, 3]]])), {azimuths: [30, 200, 310], source: 'verified'});

  const submitted = tower({source: 'BTMAP', operators: [{name: 'Play', bands: [
    {tech: 'LTE', band: '1800', azimuth: 240}, {tech: 'LTE', band: '800', azimuth: 0}, {tech: '5G', band: '3600', azimuth: 120}, {tech: 'LTE', band: '2100', azimuth: 120},
  ]}]});
  assert.deepEqual(resolveTowerAzimuths(submitted, none), {azimuths: [0, 120, 240], source: 'station'});

  const imported = tower({operators: [{name: 'Plus', bands: [{tech: 'GSM', band: '900', azimuths: [90, 210]}], azimuths: [330, 90]} as Tower['operators'][number]]});
  assert.deepEqual(resolveTowerAzimuths(imported, none), {azimuths: [90, 210, 330], source: 'station'});

  // Out-of-range and non-numeric values are dropped rather than repaired.
  const messy = tower({operators: [{name: 'Play', bands: [{tech: 'LTE', band: '1800', azimuth: 400}, {tech: 'LTE', band: '800', azimuth: Number.NaN}]}]});
  assert.deepEqual(resolveTowerAzimuths(messy, none), {azimuths: [], source: 'unknown'});
});

test('the API reports the source next to the azimuths', () => {
  const db = openDatabase(':memory:');
  try {
    const insert = db.prepare("INSERT INTO towers(id,stationId,address,province,lat,lng,operators,source,status) VALUES(?,?,?,'Mazowieckie',52.2,21.0,?,'UKE','APPROVED')");
    insert.run('UKE_plain', 'BT11111', 'A', JSON.stringify([{name: 'Play', stationIds: ['BT11111'], bands: [{tech: 'LTE', band: '1800'}]}]));
    insert.run('UKE_measured', 'BT22222', 'B', JSON.stringify([{name: 'Orange', stationIds: ['BT22222'], bands: [{tech: 'LTE', band: '800'}]}]));
    db.prepare('INSERT INTO pem_pdf_cache(key,data,checkedAt) VALUES(?,?,?)').run('k1', JSON.stringify({stationIds: ['BT22222'], antennas: [{azimuth: 300}, {azimuth: 60}, {azimuth: 180}, {azimuth: 60}]}), Date.now());

    assert.deepEqual(getCachedPdfAzimuths(db).get('BT22222'), [60, 180, 300]);
    const byId = Object.fromEntries(getTowers(db, {limit: '10'}).items.map(t => [String(t.id), [t.azimuths, t.azimuthsSource]]));
    assert.deepEqual(byId, {UKE_plain: [[], 'unknown'], UKE_measured: [[60, 180, 300], 'si2pem']});
    assert.deepEqual(withAzimuths(db, []), []);

    // Each database has its own report cache.
    const other = openDatabase(':memory:');
    try { assert.equal(getCachedPdfAzimuths(other).size, 0); } finally { other.close(); }
  } finally { db.close(); }
});
