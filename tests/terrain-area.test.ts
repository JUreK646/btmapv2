import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/database.ts';
import {calculateTerrainProfile, TerrainDataUnavailableError} from '../server/terrainProfile.ts';
import {evaluateAreaCoverage} from '../server/areaEvaluation.ts';

const countPoints = (url: string) => decodeURIComponent(new URL(url).searchParams.get('list') || new URL(url).searchParams.get('latitude') || '').split(',').length;
const text = (body: string, status = 200) => new Response(body, {status});
const gugik = (height: (i: number) => string) => (url: string) => text(Array.from({length: countPoints(url)}, (_, i) => `500000.0 300000.0 ${height(i)}`).join(','));
const openMeteo = (height: (i: number) => number) => (url: string) => text(JSON.stringify({elevation: Array.from({length: countPoints(url)}, (_, i) => height(i))}));

/** Routes each upstream to a stub; anything unlisted fails like an outage. */
const upstream = (handlers: {gugik?: (url: string) => Response; openMeteo?: (url: string) => Response}) => (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('services.gugik.gov.pl') && handlers.gugik) return handlers.gugik(url);
  if (url.includes('open-meteo.com') && handlers.openMeteo) return handlers.openMeteo(url);
  throw new Error('upstream unavailable');
}) as typeof fetch;

test('without elevation data the profile fails instead of assuming flat terrain', async () => {
  const route = {lat1: 52.101, lng1: 21.001, lat2: 52.111, lng2: 21.011, includeSurface: false};
  await assert.rejects(calculateTerrainProfile({...route, fetcher: upstream({})}), TerrainDataUnavailableError);
  // Error pages and truncated answers from both sources count as no data too.
  await assert.rejects(calculateTerrainProfile({...route, fetcher: upstream({gugik: () => text('error', 500), openMeteo: () => text('{}')})}), TerrainDataUnavailableError);
  // A failed attempt is not cached: the next request with working sources succeeds.
  const ok = await calculateTerrainProfile({...route, fetcher: upstream({gugik: gugik(() => '120.5')})});
  assert.equal(ok.source, 'GUGiK NMT (LiDAR 1 m)');
  assert.equal(ok.txElevation, 120.5);
});

test('an unreadable point is not patched with a made-up height: the other source is used', async () => {
  const route = {lat1: 52.201, lng1: 21.201, lat2: 52.211, lng2: 21.211, includeSurface: false};
  const profile = await calculateTerrainProfile({...route, fetcher: upstream({gugik: gugik(i => (i === 3 ? 'brak' : '110.0')), openMeteo: openMeteo(i => 200 + i)})});
  assert.equal(profile.source, 'Copernicus DEM (90 m)');
  assert.equal(profile.txElevation, 200);
  assert.ok(profile.points.every(p => p.elevation >= 200), 'no point carries the 100 m placeholder');

  // When the second source is down as well, the gap is an error, not a guess.
  const other = {lat1: 52.301, lng1: 21.301, lat2: 52.311, lng2: 21.311, includeSurface: false};
  await assert.rejects(calculateTerrainProfile({...other, fetcher: upstream({gugik: gugik(i => (i === 0 ? '' : '110.0'))})}), TerrainDataUnavailableError);
});

function areaFixture() {
  const db = openDatabase(':memory:');
  const tower = db.prepare("INSERT INTO towers(id,stationId,address,province,lat,lng,operators,height,source,status) VALUES(?,?,?,'Mazowieckie',?,?,?,?,'UKE','APPROVED')");
  const ops = (name: string, stationId: string, azimuths?: number[]) => JSON.stringify([{name, stationIds: [stationId], azimuths, bands: [{tech: 'LTE', band: '800'}, {tech: 'LTE', band: '1800'}, {tech: '5G', band: '3600'}]}]);
  // Play: UKE azimuths and a recorded height. Plus: neither. Orange/T-Mobile: nothing in range.
  tower.run('UKE_play', 'WAW0001', 'Warszawa, A', 52.2050, 21.0, ops('Play', 'WAW0001', [0, 180]), 42);
  tower.run('UKE_plus', 'BT20001', 'Warszawa, B', 52.2050, 21.001, ops('Plus', 'BT20001'), null);
  const pem = db.prepare("INSERT INTO pem_report_operator_counts(towerId,operator,count,partial,checkedAt) VALUES(?,?,2,0,'2027-02-01T00:00:00.000Z')");
  pem.run('UKE_play', 'Play'); pem.run('UKE_plus', 'Plus');
  return db;
}

test('the area audit rates only what it knows and says what it could not check', async () => {
  const db = areaFixture();
  try {
    // The target lies due south of both stations (bearing 180°).
    const result = await evaluateAreaCoverage(db, {centerLat: 52.2, centerLng: 21.0005, radiusM: 300}, upstream({gugik: gugik(() => '100.0')}));
    const play = result.operators.find(o => o.operator === 'Play')!, plus = result.operators.find(o => o.operator === 'Plus')!;

    assert.equal(play.servingStation!.sectorKnown, true);
    assert.equal(play.servingStation!.bestSectorAzimuth, 180);
    assert.ok(play.servingStation!.sectorDeviationDeg < 10);
    assert.equal(play.servingStation!.heightKnown, true);
    assert.equal(play.servingStation!.antennaHeightM, 42);
    assert.equal(play.servingStation!.losKnown, true);
    assert.equal(play.scoreBreakdown.sectorAlignment, 20);

    // No azimuths from any real source: no 0°/120°/240° layout is assumed, the category gets the neutral half.
    assert.equal(plus.servingStation!.sectorKnown, false);
    assert.equal(plus.servingStation!.isMainLobe, false);
    assert.equal(plus.servingStation!.isBacklobe, false);
    assert.equal(plus.scoreBreakdown.sectorAlignment, 10);
    assert.equal(plus.servingStation!.heightKnown, false);
    assert.ok(plus.cons.some(c => /azymutach anten/.test(c)));
    assert.ok(plus.cons.some(c => /przyjęto 38 m/.test(c)));
    assert.ok(!plus.pros.concat(plus.cons).some(c => /Wiązka główna|listka wstecznego|odchylenie kątowe/i.test(c)), 'no statement about a sector direction that is not known');

    assert.equal(result.operators[0].isWinner, true);
    for (const name of ['Orange', 'T-Mobile'] as const) {
      const op = result.operators.find(o => o.operator === name)!;
      assert.equal(op.servingStation, null); assert.equal(op.isWinner, false);
      // Nothing measured to rate: no made-up points, marked as not rated.
      assert.equal(op.rated, false); assert.equal(op.score, 0);
    }
    assert.equal(play.rated, true);
    assert.ok(play.pros.some(p => /SI2PEM \(sprawdzono 2027-02-01\)/.test(p)), 'the date shown is when SI2PEM was checked, not a report date');
  } finally { db.close(); }
});

test('when terrain data is down the audit reports line of sight as unknown, not as clear', async () => {
  const db = areaFixture();
  try {
    const result = await evaluateAreaCoverage(db, {centerLat: 52.2001, centerLng: 21.0006, radiusM: 300}, upstream({}));
    const play = result.operators.find(o => o.operator === 'Play')!;
    assert.equal(play.servingStation!.losKnown, false);
    assert.equal(play.servingStation!.isLosClear, false);
    assert.equal(play.servingStation!.obstructionM, 0);
    assert.ok(play.cons.some(c => /widoczność optyczna nie została sprawdzona/.test(c)));
    assert.ok(!play.pros.some(c => /Czysta widoczność/.test(c)));
    // Distance points (12 for under 1 km) plus the neutral half of the line-of-sight points.
    assert.equal(play.scoreBreakdown.terrainLos, 12 + 9);
  } finally { db.close(); }
});

test('with no confirmed station in range nobody is declared the best operator', async () => {
  const db = openDatabase(':memory:');
  try {
    const result = await evaluateAreaCoverage(db, {centerLat: 52.2, centerLng: 21.0}, upstream({}));
    assert.ok(result.operators.every(o => !o.isWinner && o.servingStation === null));
    assert.match(result.summaryRecommendation, /nie da się wskazać najlepszego operatora/);
  } finally { db.close(); }
});
