import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, join} from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import {openDatabase} from '../server/database.ts';
import {parseTechAndBand, parseUkeRows, selectRegistryFiles, syncUkeWykaz} from '../server/ukeSync.ts';

const DIR = '/download/gfx/bip/pl/defaultaktualnosci/140/12/101/';
const page = (...names: string[]) => `<html><body><ul>${names.map(n => `<li><a href="${DIR}${n}">${n}</a> - 1,4 MB plik XLSX</li>`).join('')}</ul><a href="/inna/strona.html">x</a></body></html>`;
const LTE = 'lte1800_-_stan_na_2026-10-26.xlsx', NR = '5g3600_-_stan_na_2026-10-26.xlsx', GSMR = 'gsm-r_-_stan_na_2026-10-26.xlsx';
const PRIVATE = 'sieci_prywatne_3800-4200_mhz_stan_na_2026-11-04.xlsx';

test('the registry date comes from the technology lists, not from a side file published on its own schedule', () => {
  const listed = selectRegistryFiles(page(LTE, NR, GSMR, PRIVATE, LTE, 'instrukcja_obslugi.xlsx'));
  assert.deepEqual(listed.files.map(f => [f.filename, f.tech, f.band, f.date, f.recognised]), [
    [LTE, 'LTE', '1800', '2026-10-26', true],
    [NR, '5G', '3600', '2026-10-26', true],
    [GSMR, 'GSM-R', '900', '2026-10-26', true],
    [PRIVATE, 'Inne', '3800', '2026-11-04', false],
  ]);
  assert.equal(listed.date, '2026-10-26');
  assert.deepEqual(listed.skipped, ['instrukcja_obslugi.xlsx'], 'a file naming neither a technology nor a frequency is not imported as "Inne 0"');
  assert.equal(listed.files[0].url, `https://bip.uke.gov.pl${DIR}${LTE}`);
  assert.equal(parseTechAndBand('instrukcja_obslugi.xlsx'), null);

  // Any changed file changes the fingerprint, also the side file; the same set in another order does not.
  const later = selectRegistryFiles(page(LTE, NR, GSMR, PRIVATE.replace('2026-11-04', '2026-11-18')));
  assert.notEqual(later.fingerprint, listed.fingerprint);
  assert.equal(later.date, '2026-10-26');
  assert.equal(selectRegistryFiles(page(PRIVATE, GSMR, NR, LTE)).fingerprint, listed.fingerprint);
});

const HEADER = ['Operator', 'Nr decyzji', 'Rodzaj decyzji', 'Data ważności', 'Dł geogr stacji', 'Szer geogr stacji', 'Miejscowość', 'Lokalizacja', 'IdStacji', 'TERYT'];
const row = (operator: string, permit: string, lng: number, lat: number, id: string, city = 'Warszawa') => [operator, permit, 'P', '2030-12-31', lng, lat, city, 'ul. Testowa 1', id, '1465011'];

test('a sheet with an unknown layout is an error, an empty list is not', () => {
  const stations = new Map();
  assert.equal(parseUkeRows([HEADER, row('P4 Sp. z o.o.', 'REJ/1/1/1/26', 21.0, 52.2, 'WAW0001'), ['bez współrzędnych']], 'LTE', '1800', stations), 1);
  assert.equal(stations.size, 1);
  assert.equal(parseUkeRows([HEADER], 'LTE', '1800', new Map()), 0);
  assert.throws(() => parseUkeRows([['Podmiot', 'Lokalizacja', 'Częstotliwość'], ['X', 'Y', 'Z']], 'LTE', '1800', new Map()), /nieznany układ.*operator.*szerokość.*długość.*id stacji/s);
  assert.throws(() => parseUkeRows([], 'LTE', '1800', new Map()), /pusty/);
});

/** A fake BIP UKE: a page listing files, each file served as bytes; sheets are "read" from the map below. */
function fakeUke(tempDir: string) {
  const state = {
    files: [LTE, NR, PRIVATE],
    failing: new Set<string>(),
    sheets: new Map<string, unknown[][]>([
      [LTE, [HEADER, row('P4 Sp. z o.o.', 'REJ/1/1/1/26', 21.0, 52.2, 'WAW0001'), row('Orange Polska S.A.', 'REJ/2/2/1/26', 19.9, 50.05, '28441', 'Kraków')]],
      [NR, [HEADER, row('P4 Sp. z o.o.', 'REJ/1/1/2/26', 21.0, 52.2, 'WAW0001')]],
      [PRIVATE, [HEADER, row('Fabryka S.A.', 'SP/1/26', 18.6, 54.35, 'PRV1', 'Gdańsk')]],
    ]),
    downloads: [] as string[],
  };
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('.html')) return new Response(page(...state.files));
    const name = basename(new URL(url).pathname);
    state.downloads.push(name);
    return state.failing.has(name) ? new Response('error', {status: 500}) : new Response('xlsx-bytes');
  }) as typeof fetch;
  const readSheet = async (filePath: string) => {
    const sheet = state.sheets.get(basename(filePath));
    if (!sheet) throw new Error('unreadable workbook');
    return sheet;
  };
  return {state, options: {fetcher, readSheet, tempDir, retryDelayMs: 0}};
}
const meta = (db: DatabaseSync, key: string) => String(db.prepare('SELECT value FROM metadata WHERE key=?').get(key)?.value ?? '');
const bandsOf = (db: DatabaseSync, stationId: string) => (JSON.parse(String(db.prepare('SELECT operators FROM towers WHERE stationId=?').get(stationId)!.operators)) as Array<{bands: Array<{tech: string; band: string}>}>)
  .flatMap(op => op.bands.map(b => `${b.tech} ${b.band}`)).sort();

test('a registry sync is all-or-nothing and follows file changes', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'btmap-uke-'));
  const db = openDatabase(':memory:');
  try {
    const {state, options} = fakeUke(tempDir);

    const first = await syncUkeWykaz(db, options);
    assert.equal(first.updated, true);
    assert.equal(first.date, '2026-10-26');
    assert.equal(meta(db, 'ukeWykazDate'), '2026-10-26', 'not the date of the private-network file');
    assert.deepEqual(bandsOf(db, 'WAW0001'), ['5G 3600', 'LTE 1800']);
    assert.deepEqual(bandsOf(db, 'PRV1'), ['Inne 3800']);
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS c FROM towers').get()!.c), 3);
    assert.equal(Number(db.prepare("SELECT COUNT(*) AS c FROM registry_snapshots WHERE date='2026-10-26'").get()!.c), 2);

    // Nothing changed on the page: no download, no rewrite.
    state.downloads.length = 0;
    const again = await syncUkeWykaz(db, options);
    assert.equal(again.updated, false);
    assert.deepEqual(state.downloads, []);

    // One technology list cannot be downloaded. Saving the rest would strip LTE 1800 from every station.
    state.files = [LTE.replace('10-26', '11-09'), NR.replace('10-26', '11-09'), PRIVATE];
    state.sheets.set(state.files[0], state.sheets.get(LTE)!);
    state.sheets.set(state.files[1], [HEADER, row('P4 Sp. z o.o.', 'REJ/1/1/2/26', 21.0, 52.2, 'WAW0001'), row('T-Mobile Polska S.A.', 'REJ/3/1/26', 17.0, 51.1, 'WRO0001', 'Wrocław')]);
    state.failing.add(state.files[0]);
    await assert.rejects(syncUkeWykaz(db, options), /Nie udało się wczytać pliku lte1800.*HTTP 500/);
    assert.equal(state.downloads.filter(n => n === state.files[0]).length, 3, 'the download is retried before giving up');
    assert.deepEqual(bandsOf(db, 'WAW0001'), ['5G 3600', 'LTE 1800'], 'the database is untouched');
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS c FROM towers').get()!.c), 3);
    assert.equal(meta(db, 'ukeWykazDate'), '2026-10-26');
    assert.match(meta(db, 'ukeSyncError'), /lte1800/);

    // An unreadable or re-laid-out technology list stops the sync the same way.
    state.failing.clear();
    state.sheets.set(state.files[0], [['Podmiot', 'Adres'], ['X', 'Y']]);
    await assert.rejects(syncUkeWykaz(db, options), /nieznany układ/);
    assert.deepEqual(bandsOf(db, 'WAW0001'), ['5G 3600', 'LTE 1800']);

    // The source recovers: the next run picks the new registry up, because the failed one was never recorded as done.
    state.sheets.set(state.files[0], state.sheets.get(LTE)!);
    const recovered = await syncUkeWykaz(db, options);
    assert.equal(recovered.updated, true);
    assert.equal(meta(db, 'ukeWykazDate'), '2026-11-09');
    assert.equal(meta(db, 'ukeSyncError'), '');
    assert.deepEqual(bandsOf(db, 'WRO0001'), ['5G 3600']);
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS c FROM towers').get()!.c), 4);

    // Only the side file is republished: that is a change too, but the registry date stays.
    state.files = [state.files[0], state.files[1], PRIVATE.replace('2026-11-04', '2026-11-18')];
    state.sheets.set(state.files[2], [HEADER, row('Fabryka S.A.', 'SP/1/26', 18.6, 54.35, 'PRV1', 'Gdańsk'), row('Port S.A.', 'SP/2/26', 18.65, 54.4, 'PRV2', 'Gdynia')]);
    const sideOnly = await syncUkeWykaz(db, options);
    assert.equal(sideOnly.updated, true);
    assert.equal(meta(db, 'ukeWykazDate'), '2026-11-09');
    assert.deepEqual(bandsOf(db, 'PRV2'), ['Inne 3800']);

    // A side file that cannot be read is skipped; its stations stay as they were and the registry still syncs.
    state.files = [LTE.replace('10-26', '11-23'), NR.replace('10-26', '11-23'), PRIVATE.replace('2026-11-04', '2026-11-30')];
    state.sheets.set(state.files[0], state.sheets.get(LTE)!);
    state.sheets.set(state.files[1], state.sheets.get(NR)!);
    state.sheets.set(state.files[2], [['Nazwa sieci', 'Obszar'], ['A', 'B']]);
    const withBrokenSideFile = await syncUkeWykaz(db, options);
    assert.equal(withBrokenSideFile.updated, true);
    assert.equal(meta(db, 'ukeWykazDate'), '2026-11-23');
    assert.deepEqual(bandsOf(db, 'PRV2'), ['Inne 3800'], 'stations of an unreadable side file are not treated as removed');
    assert.equal(db.prepare("SELECT id FROM towers WHERE stationId='WRO0001'").get(), undefined, 'a station missing from the new registry is gone');
  } finally { db.close(); rmSync(tempDir, {recursive: true, force: true}); }
});

test('stations no longer in the registry are removed; community and imported records are not', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'btmap-uke-'));
  const db = openDatabase(':memory:');
  try {
    const {state, options} = fakeUke(tempDir);
    state.files = [LTE, NR];
    const many = Array.from({length: 10}, (_, i) => row('P4 Sp. z o.o.', `REJ/9/${i}/1/26`, 20 + i * 0.1, 51 + i * 0.1, `ST${i}`));
    state.sheets.set(LTE, [HEADER, ...many]);
    state.sheets.set(NR, [HEADER, many[0]]);
    await syncUkeWykaz(db, options);
    assert.equal(Number(db.prepare("SELECT COUNT(*) AS c FROM towers WHERE source='UKE'").get()!.c), 10);

    // Records the sync does not own: a community station, a KML import and a BTMap copy of a registry station.
    const other = db.prepare("INSERT INTO towers(id,stationId,address,province,lat,lng,operators,source,addedBy,status) VALUES(?,?,'X','Mazowieckie',52.2,21.0,'[]',?,?,'APPROVED')");
    other.run('BTMAP_abc', 'COMM1', 'BTMAP', 'Anna');
    other.run('UKE_kml', 'KML1', 'UKE', 'Import KML');
    other.run('BTMAP_ST9', 'ST9', 'BTMAP', 'Anna');
    const ST9 = String(db.prepare("SELECT id FROM towers WHERE stationId='ST9' AND source='UKE'").get()!.id);
    db.prepare("INSERT INTO pem_report_operator_counts(towerId,operator,count,partial,checkedAt) VALUES(?, 'Play', 2, 0, '2027-01-01')").run(ST9);

    // UKE drops ST8 and ST9 (2 of 10 = 20%, at the limit).
    const next = (name: string) => name.replace('10-26', '11-09');
    state.files = [next(LTE), next(NR)];
    state.sheets.set(state.files[0], [HEADER, ...many.slice(0, 8)]);
    state.sheets.set(state.files[1], [HEADER, many[0]]);
    const result = await syncUkeWykaz(db, options);
    assert.match(result.message, /usunięto 2 stacji/);
    const left = db.prepare('SELECT stationId FROM towers ORDER BY stationId').all().map(r => String(r.stationId));
    assert.deepEqual(left, ['COMM1', 'KML1', 'ST0', 'ST1', 'ST2', 'ST3', 'ST4', 'ST5', 'ST6', 'ST7', 'ST9']);
    assert.equal(String(db.prepare("SELECT source FROM towers WHERE stationId='ST9'").get()!.source), 'BTMAP', 'only the BTMap copy of ST9 remains');
    assert.equal(db.prepare('SELECT 1 FROM pem_report_operator_counts WHERE towerId=?').get(ST9), undefined, 'its cached report counts go with it');
    assert.equal(meta(db, 'ukeSyncRemoved'), '2');

    // A registry missing far more stations looks truncated: nothing is touched unless forced.
    state.files = [LTE.replace('10-26', '11-23'), NR.replace('10-26', '11-23')];
    state.sheets.set(state.files[0], [HEADER, ...many.slice(0, 3)]);
    state.sheets.set(state.files[1], [HEADER, many[0]]);
    await assert.rejects(syncUkeWykaz(db, options), /nie zawiera 5 z 8 stacji.*--force/s);
    assert.equal(Number(db.prepare("SELECT COUNT(*) AS c FROM towers WHERE source='UKE' AND addedBy='AutoSync BIP UKE'").get()!.c), 8);
    assert.equal(meta(db, 'ukeWykazDate'), '2026-11-09');
    assert.match(meta(db, 'ukeSyncError'), /niepełny plik/);

    const forced = await syncUkeWykaz(db, {...options, force: true});
    assert.match(forced.message, /usunięto 5 stacji/);
    assert.equal(Number(db.prepare("SELECT COUNT(*) AS c FROM towers WHERE source='UKE' AND addedBy='AutoSync BIP UKE'").get()!.c), 3);
    assert.equal(Number(db.prepare("SELECT COUNT(*) AS c FROM towers WHERE addedBy<>'AutoSync BIP UKE'").get()!.c), 3, 'community and imported records survive a forced sync too');
  } finally { db.close(); rmSync(tempDir, {recursive: true, force: true}); }
});

test('a page without registry files is reported as an error instead of passing silently', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'btmap-uke-'));
  const db = openDatabase(':memory:');
  try {
    const fetcher = (async () => new Response('<html><body>Strona w przebudowie</body></html>')) as typeof fetch;
    await assert.rejects(syncUkeWykaz(db, {fetcher, tempDir, retryDelayMs: 0}), /nie znaleziono plików wykazu/);
    assert.match(meta(db, 'ukeSyncError'), /nie znaleziono plików wykazu/);
  } finally { db.close(); rmSync(tempDir, {recursive: true, force: true}); }
});
