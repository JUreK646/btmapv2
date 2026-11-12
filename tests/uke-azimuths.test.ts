import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openDatabase} from '../server/database.ts';
import {getTowers} from '../server/query.ts';
import {applyKmlAzimuths, carryOverAzimuths, normalizeAzimuths, parseKmlStationAzimuths} from '../server/kmlAzimuths.ts';

const placemark = (name: string, coords: string, extra = '<b>Azimuths:</b> 50°, 220°, 320°<br/>') => `<Placemark>
<name>${name}</name>
<description><![CDATA[<b>Bands:</b> LTE 1800<br/><b>City:</b> Kraków<br/><b>Address:</b> Tyniecka 45<br/><b>Region:</b> Małopolskie<br/>${extra}<br/><b>Permits (1):</b><br/>LTE 1800: MNET/14/28441/3/26 [zmP] - expires 2032-08-31]]></description>
<styleUrl>#s</styleUrl><Point><coordinates>${coords}</coordinates></Point>
</Placemark>`;

const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Folder><name>Stacje</name><open>1</open>
<Folder><name>Orange</name><open>1</open>
${placemark('28441', '19.9,50.05,0')}
${placemark('BT00001', '21.0,52.2,0', '<b>Azimuths:</b> 360°<br/>')}
${placemark('NOAZ', '21.1,52.3,0', '')}
</Folder>
<Folder><name>Play</name><open>1</open>
${placemark('WAW0001', '21.2,52.4,0', '<b>Azimuths:</b> 120°, 0°, 240°, 120°<br/>')}
${placemark('GHOST', '18.0,54.0,0', '<b>Azimuths:</b> 10°<br/>')}
</Folder>
</Folder>
<Folder><name>Azymuty</name><open>0</open>
<Folder><name>Orange</name><open>0</open>
<Placemark><name>28441</name><description><![CDATA[<b>Azimuths:</b> 77°]]></description><LineString><coordinates>19.9,50.05,0 19.91,50.06,0</coordinates></LineString></Placemark>
</Folder>
</Folder>
</Document></kml>`;

test('azimuths are read from the station placemarks of the UKE permit KML', () => {
  assert.deepEqual(parseKmlStationAzimuths(kml), [
    {stationId: '28441', operator: 'Orange', lat: 50.05, lng: 19.9, azimuths: [50, 220, 320]},
    {stationId: 'BT00001', operator: 'Orange', lat: 52.2, lng: 21, azimuths: [0]},
    {stationId: 'WAW0001', operator: 'Play', lat: 52.4, lng: 21.2, azimuths: [0, 120, 240]},
    {stationId: 'GHOST', operator: 'Play', lat: 54, lng: 18, azimuths: [10]},
  ]);
  assert.deepEqual(normalizeAzimuths(['359°', ' 360 ', '12,4', 400, -5, 'x', null, 45.6]), [0, 12, 46, 359]);
});

test('UKE azimuths land on the matching operator and are served with their source', () => {
  const db = openDatabase(':memory:');
  try {
    const insert = db.prepare("INSERT INTO towers(id,stationId,address,province,lat,lng,operators,source,addedBy,status) VALUES(?,?,?,'Małopolskie',?,?,?,'UKE','Import KML','APPROVED')");
    const idFor = (lat: number, lng: number, operator: string, stationId: string) => 'UKE_' + createHash('sha256').update(`${lat.toFixed(6)},${lng.toFixed(6)}|${operator}|${stationId}`).digest('hex').slice(0, 18);
    const ops = (name: string, stationId: string) => JSON.stringify([{name, stationIds: [stationId], bands: [{tech: 'LTE', band: '1800', permit: 'MNET/14/1/3/26 [zmP]'}]}]);
    const krakow = idFor(50.05, 19.9, 'Orange', '28441');
    insert.run(krakow, '28441', 'Kraków', 50.05, 19.9, ops('Orange', '28441'));
    // Stored under another id (e.g. moved off a shared mast) - matched by station id and operator instead.
    insert.run('UKE_moved', 'WAW0001', 'Warszawa', 52.40005, 21.20008, ops('Play', 'WAW0001'));
    // Same station id, different operator: must not receive Play's azimuths.
    insert.run('UKE_other', 'WAW0001', 'Warszawa', 52.4, 21.2, ops('Plus', 'WAW0001'));
    insert.run('UKE_none', 'NOAZ', 'Warszawa', 52.3, 21.1, ops('Orange', 'NOAZ'));
    const before = db.prepare("SELECT operators FROM towers WHERE id IN ('UKE_other','UKE_none') ORDER BY id").all();

    assert.deepEqual(applyKmlAzimuths(db, parseKmlStationAzimuths(kml)), {stations: 4, matched: 2, updated: 2});
    assert.deepEqual(applyKmlAzimuths(db, parseKmlStationAzimuths(kml)), {stations: 4, matched: 2, updated: 0}, 'running the import again changes nothing');
    assert.deepEqual(db.prepare("SELECT operators FROM towers WHERE id IN ('UKE_other','UKE_none') ORDER BY id").all(), before);
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS count FROM towers').get()!.count), 4, 'no station is created');

    const served = Object.fromEntries(getTowers(db, {limit: '10'}).items.map(t => [String(t.id), [t.azimuths, t.azimuthsSource]]));
    assert.deepEqual(served, {[krakow]: [[50, 220, 320], 'uke'], UKE_moved: [[0, 120, 240], 'uke'], UKE_other: [[], 'unknown'], UKE_none: [[], 'unknown']});
    // The permit data of the operator is left as it was.
    const stored = JSON.parse(String(db.prepare('SELECT operators FROM towers WHERE id=?').get(krakow)!.operators));
    assert.deepEqual(stored, [{name: 'Orange', stationIds: ['28441'], bands: [{tech: 'LTE', band: '1800', permit: 'MNET/14/1/3/26 [zmP]'}], azimuths: [50, 220, 320]}]);
  } finally { db.close(); }
});

test('a registry sync keeps azimuths it does not carry itself', () => {
  const stored = JSON.stringify([{name: 'Orange', bands: [], azimuths: [50, 220, 320]}, {name: 'Play', bands: [], azimuths: [10]}, {name: 'Plus', bands: []}]);
  const next = [
    {name: 'Orange', bands: [{tech: 'LTE', band: '800'}]},
    {name: 'Play', bands: [], azimuths: [200, 80]},
    {name: 'Plus', bands: []},
    {name: 'T-Mobile', bands: []},
  ];
  assert.deepEqual(carryOverAzimuths(next, stored), [
    {name: 'Orange', bands: [{tech: 'LTE', band: '800'}], azimuths: [50, 220, 320]},
    {name: 'Play', bands: [], azimuths: [200, 80]},
    {name: 'Plus', bands: []},
    {name: 'T-Mobile', bands: []},
  ]);
  assert.deepEqual(carryOverAzimuths([{name: 'Orange'}], 'not json'), [{name: 'Orange'}]);
  assert.deepEqual(carryOverAzimuths([{name: 'Orange'}], null), [{name: 'Orange'}]);
});
