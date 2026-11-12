import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import {openDatabase} from '../server/database.ts';
import {computeMonthlyReports, ensureRegistrySnapshot, getTelecomStats, invalidateStatsCache, loadRegistrySnapshots, recordRegistrySnapshot} from '../server/stats.ts';

const band = (tech: string, name: string, permit = 'REJ/1/1/1/26 [P]') => ({tech, band: name, status: 'Pozwolenie', permit});
let serial = 0;
function addTower(db: DatabaseSync, operator: string, bands: object[], id = `UKE_t${++serial}`) {
  db.prepare("INSERT INTO towers(id,stationId,address,province,lat,lng,operators,source,addedBy,status,createdAt) VALUES(?,?,?,?,52.2,21.0,?,'UKE','AutoSync BIP UKE','APPROVED','2026-01-01T00:00:00.000Z')")
    .run(id, id, 'Warszawa', 'Mazowieckie', JSON.stringify([{name: operator, bands}]));
  return id;
}
function fixture() {
  const db = openDatabase(':memory:');
  invalidateStatsCache();
  for (let i = 0; i < 40; i++) addTower(db, 'Play', [band('LTE', '1800'), band('5G', '3600')]);
  for (let i = 0; i < 25; i++) addTower(db, 'Orange', [band('LTE', '800'), band('LTE', '1800'), band('LTE', '2100'), band('LTE', '2600')]);
  for (let i = 0; i < 10; i++) addTower(db, 'Plus', [band('GSM', '900')]);
  db.prepare("INSERT INTO radiolines(id,latA,lngA,latB,lngB,frequency,operator) VALUES('rl1',52,21,52.1,21.1,18,'Play')").run();
  return db;
}
const everyGrowthNumber = (report: ReturnType<typeof computeMonthlyReports>[number]) => [
  ...Object.values(report.metrics).flatMap(m => [m.newTotal, ...m.operators.flatMap(o => [o.newCount, o.newPercent])]),
  ...report.bands.flatMap(b => [b.newCells, b.newStations, ...b.operatorCells.map(o => o.newCount), ...b.operatorStations.map(o => o.newCount)]),
];

test('with a single registry the report shows totals and no growth at all - nothing is estimated', () => {
  const db = fixture();
  try {
    db.prepare("INSERT INTO metadata(key,value) VALUES('ukeWykazDate','2027-03-01')").run();
    ensureRegistrySnapshot(db);
    ensureRegistrySnapshot(db);
    assert.equal(loadRegistrySnapshots(db, 'UKE').length, 1, 'the baseline is recorded once');

    for (const reports of [computeMonthlyReports(db, 'UKE'), computeMonthlyReports(db, 'ALL')]) {
      assert.equal(reports.length, 1);
      const [report] = reports;
      assert.equal(report.comparedTo, null);
      assert.equal(report.title, 'Stan na 01.03.2027');
      assert.match(report.dateRange, /Brak danych porównawczych/);
      assert.equal(report.metrics.stations.total, 75);
      assert.equal(report.metrics.cells.total, (40 * 2 + 25 * 4 + 10) * 3);
      assert.equal(report.metrics.permits.total, 40 * 2 + 25 * 4 + 10);
      assert.equal(report.metrics.cBand.total, 40);
      assert.equal(report.metrics.fourBandLte.total, 25);
      assert.equal(report.metrics.radiolines.total, 1);
      assert.ok(everyGrowthNumber(report).every(n => n === 0), 'growth must be 0 when there is no earlier registry to compare with');
    }

    const stats = getTelecomStats(db, 'UKE');
    assert.deepEqual(stats.timeline, []);
    assert.equal(stats.summary.latestNewTowers, 0);
    assert.equal(stats.summary.latestNewDate, '2027-03-01');
  } finally { db.close(); }
});

test('growth is the exact difference between two synced registries', () => {
  const db = fixture();
  try {
    recordRegistrySnapshot(db, '2027-03-01');

    // What a registry sync does: new stations appear, one station gains a band, one disappears.
    for (let i = 0; i < 7; i++) addTower(db, 'Play', [band('LTE', '1800'), band('5G', '3600')]);
    for (let i = 0; i < 3; i++) addTower(db, 'T-Mobile', [band('5G', '3500')]);
    const upgraded = db.prepare("SELECT id FROM towers WHERE operators LIKE '%GSM%' LIMIT 1").get()!.id;
    db.prepare('UPDATE towers SET operators=? WHERE id=?').run(JSON.stringify([{name: 'Plus', bands: [band('GSM', '900'), band('5G', '2100')]}]), upgraded);
    db.prepare("DELETE FROM towers WHERE id=(SELECT id FROM towers WHERE operators LIKE '%Orange%' LIMIT 1)").run();
    db.prepare("INSERT INTO radiolines(id,latA,lngA,latB,lngB,frequency,operator) VALUES('rl2',52,21,52.1,21.1,18,'Play'),('rl3',52,21,52.1,21.1,23,'Orange')").run();
    db.prepare("INSERT OR REPLACE INTO metadata(key,value) VALUES('ukeWykazDate','2027-03-20')").run();
    assert.equal(recordRegistrySnapshot(db), '2027-03-20');

    const reports = computeMonthlyReports(db, 'UKE');
    assert.equal(reports.length, 1);
    const [report] = reports;
    assert.equal(report.id, 'uke-2027-03-20');
    assert.equal(report.comparedTo, '2027-03-01');
    assert.equal(report.title, 'Wykaz z 20.03.2027');
    assert.match(report.dateRange, /01\.03\.2027/);

    const byOp = (bars: Array<{operator: string; total: number; newCount: number; newPercent: number}>) => Object.fromEntries(bars.map(o => [o.operator, [o.total, o.newCount]]));
    assert.deepEqual(byOp(report.metrics.stations.operators), {Plus: [10, 0], 'T-Mobile': [3, 3], Orange: [24, 0], Play: [47, 7]});
    assert.equal(report.metrics.stations.total, 84);
    assert.equal(report.metrics.stations.newTotal, 10);
    assert.deepEqual(byOp(report.metrics.cBand.operators), {Plus: [0, 0], 'T-Mobile': [3, 3], Orange: [0, 0], Play: [47, 7]});
    assert.deepEqual(byOp(report.metrics.permits.operators), {Plus: [11, 1], 'T-Mobile': [3, 3], Orange: [96, 0], Play: [94, 14]});
    assert.deepEqual(byOp(report.metrics.cells.operators), {Plus: [33, 3], 'T-Mobile': [9, 9], Orange: [288, 0], Play: [282, 42]});
    assert.deepEqual(byOp(report.metrics.radiolines.operators), {Plus: [0, 0], 'T-Mobile': [0, 0], Orange: [1, 1], Play: [2, 1]});
    assert.equal(report.metrics.fourBandLte.newTotal, 0, 'a removed station is not counted as growth');
    assert.equal(report.metrics.stations.operators.find(o => o.operator === 'Play')!.newPercent, 14.89);

    const cBand = report.bands.find(b => b.key === 'NR 3500 (TDD)')!;
    assert.equal(cBand.totalStations, 50); assert.equal(cBand.newStations, 10); assert.equal(cBand.newCells, 30);
    const nr2100 = report.bands.find(b => b.key === 'NR 2100 (FDD)')!;
    assert.equal(nr2100.newStations, 1);
    const gsm900 = report.bands.find(b => b.key === 'GSM 900')!;
    assert.equal(gsm900.totalStations, 10); assert.equal(gsm900.newStations, 0); assert.equal(gsm900.newCells, 0);

    const stats = getTelecomStats(db, 'UKE');
    assert.equal(stats.timeline.length, 1);
    assert.equal(stats.timeline[0].period, '2027-03-20');
    assert.equal(stats.timeline[0].label, '20 marca 2027 (wykaz UKE)');
    assert.equal(stats.timeline[0].totalNew, 10);
    assert.deepEqual(stats.timeline[0].operators, [{operator: 'Play', count: 7}, {operator: 'T-Mobile', count: 3}]);
    assert.deepEqual(stats.timeline[0].topBands.slice(0, 2), [{band: '5G 3500', count: 10}, {band: 'LTE 1800', count: 7}]);
    assert.equal(stats.summary.latestNewTowers, 10);
    assert.equal(stats.summary.latestNewDate, '2027-03-20');
    assert.deepEqual(stats.monthlyReports, reports);
  } finally { db.close(); }
});

test('every further registry adds a report compared with the one before it', () => {
  const db = fixture();
  try {
    recordRegistrySnapshot(db, '2027-03-01');
    addTower(db, 'Play', [band('LTE', '1800')]);
    recordRegistrySnapshot(db, '2027-03-20');
    addTower(db, 'Orange', [band('LTE', '800')]);
    addTower(db, 'Orange', [band('LTE', '800')]);
    recordRegistrySnapshot(db, '2027-04-02');

    const reports = computeMonthlyReports(db, 'UKE');
    assert.deepEqual(reports.map(r => [r.id, r.comparedTo, r.metrics.stations.newTotal]), [['uke-2027-04-02', '2027-03-20', 2], ['uke-2027-03-20', '2027-03-01', 1]]);
    // The older report keeps the totals of its own registry, not today's.
    assert.equal(reports[1].metrics.stations.total, 76);
    assert.deepEqual(getTelecomStats(db, 'UKE').timeline.map(t => [t.period, t.totalNew]), [['2027-03-20', 1], ['2027-04-02', 2]]);
  } finally { db.close(); }
});

test('the statistics code carries no fixed registry dates or growth figures', () => {
  const source = readFileSync(resolve('server', 'stats.ts'), 'utf8');
  assert.doesNotMatch(source, /20\d\d-\d\d-\d\d/, 'server/stats.ts must not hardcode dates');
  assert.doesNotMatch(source, /WYKAZ_|NOV_MONTH|Deltas\s*=/, 'growth must come from snapshots, not constants');
});
