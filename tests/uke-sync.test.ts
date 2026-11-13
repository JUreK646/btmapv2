import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, join} from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import {openDatabase} from '../server/database.ts';
import {mapOperatorName, parseDmsCoord, parseTechAndBand, parseUkeRows, selectRegistryFiles, syncUkeWykaz} from '../server/ukeSync.ts';
import {parseCellSystem, parseRegisterSheets, readRegisterWorkbook, selectRegisterFiles, type RegisterFile, type RegisterStation} from '../server/ukeRegister.ts';

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

test('the private-network list is read: packed DDMMSS coordinates and a frequency range per row', () => {
  // Layout and values as in sieci_prywatne_3800-4200_mhz_stan_na_2026-11-04.xlsx on BIP UKE.
  const header = ['Nazwa Operatora', 'Nr Decyzji', 'Rodzaj decyzji', 'Data ważności', 'Dł. geogr. stacji', 'Szer. geogr. stacji', 'Miejscowość', 'Lokalizacja', 'IdStacji', 'TERYT', 'Rodzaj stacji', 'Zakres częstotliwości [MHz]'];
  const rows = [
    header,
    ['Teldat sp. z o.o. sp. k.', 'DC.WSR.5101.22271.2025', 'P', new Date('2026-12-31T00:00:00Z'), 180137, 530806, 'Bydgoszcz', 'Cicha 19-27', 'NET5G PLMN 00101', 461011, 'małej mocy', '3900-4000'],
    ['Adamed Pharma S.A.', 'DC.WSR.5101.24335.2026', 'P', new Date('2027-04-30T00:00:00Z'), 192152, 514005, 'Pabianice', 'Piłsudskiego 5', 'ADA0001', 1008021, 'małej mocy', '3800-3900'],
  ];
  const stations = new Map();
  assert.equal(parseUkeRows(rows, 'Inne', '3800', stations), 2);
  const [bydgoszcz, pabianice] = [...stations.values()];
  assert.equal(bydgoszcz.lat, 53.135); assert.equal(bydgoszcz.lng, 18.026944);
  assert.equal(bydgoszcz.province, 'Kujawsko-pomorskie');
  assert.deepEqual(bydgoszcz.operators[0].bands.map((b: {tech: string; band: string}) => `${b.tech} ${b.band}`), ['Inne 3900']);
  assert.deepEqual(pabianice.operators[0].bands.map((b: {band: string}) => b.band), ['3800']);
  assert.match(bydgoszcz.operators[0].bands[0].permit, /DC\.WSR\.5101\.22271\.2025 \[P\] - expires 2026-12-31/);

  // Packed values are recognised whether stored as numbers or text; plain degrees are left alone.
  assert.equal(parseDmsCoord(530806), 53.135);
  assert.equal(parseDmsCoord('180137'), 18.026944);
  assert.equal(parseDmsCoord(52.2297), 52.2297);
  assert.equal(parseDmsCoord(536006), null, '60 minutes is not a valid DDMMSS value');

  // Rows whose coordinates cannot be read at all are an error, not an empty list.
  assert.throws(() => parseUkeRows([header, ['X', 'D/1', 'P', '', 'brak', 'brak', 'Y', 'Z', 'ID1', '', '', '']], 'Inne', '3800', new Map()), /Żaden z 1 wierszy/);
});

/** A fake BIP UKE: a page listing files, each file served as bytes; sheets are "read" from the map below. */
const REGISTER_DIR = '/download/gfx/bip/pl/defaultstronaopisowa/141/1/457/';
const registerPage = (...names: string[]) => `<html><body>${names.map(n => `<a href="${REGISTER_DIR}${n}">${n}</a>`).join('')}</body></html>`;

function fakeUke(tempDir: string, registerCacheDir = join(tempDir, 'register-cache')) {
  const state = {
    files: [LTE, NR, PRIVATE],
    registerFiles: [] as string[],
    registers: new Map<string, RegisterStation[]>(),
    registerReads: [] as string[],
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
    if (url.includes('rejestr-urzadzen')) return new Response(registerPage(...state.registerFiles));
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
  const readRegister = async (_path: string, file: RegisterFile) => {
    state.registerReads.push(file.filename);
    const stations = state.registers.get(file.filename);
    if (!stations) throw new Error('unreadable register');
    return stations;
  };
  return {state, options: {fetcher, readSheet, readRegister, tempDir, registerCacheDir, retryDelayMs: 0}};
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

test('old KML copies of registry stations are merged into them; KML stations the registry lacks stay', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'btmap-uke-'));
  const db = openDatabase(':memory:');
  try {
    const {state, options} = fakeUke(tempDir);
    state.files = [LTE, NR];
    state.sheets.set(LTE, [HEADER, row('Orange Polska S.A.', 'MNET/1/1/4/26', 20.977777777777778, 52.22972222222222, '13801')]);
    state.sheets.set(NR, [HEADER, row('Orange Polska S.A.', 'MNET/1/1/4/26', 20.977777777777778, 52.22972222222222, '13801')]);
    const kml = db.prepare("INSERT INTO towers(id,stationId,address,province,lat,lng,operators,source,addedBy,status) VALUES(?,?,'X','Mazowieckie',?,?,?,'UKE','Import KML','APPROVED')");
    const ops = (name: string, azimuths?: number[]) => JSON.stringify([{name, stationIds: [], azimuths, bands: [{tech: 'GSM', band: '900', permit: 'old'}]}]);
    // The same site, coordinates rounded by the KML, so its id differs from the registry's.
    kml.run('UKE_kml_twin', '13801', 52.229722, 20.977778, ops('Orange', [10, 130, 250]));
    // Same station ID but another operator, and the same operator far away: different sites.
    kml.run('UKE_kml_other_op', '13801', 52.229722, 20.977778, ops('Play'));
    kml.run('UKE_kml_far', '13801', 50.06, 19.94, ops('Orange'));
    // Not in the registry at all (e.g. a Plus site): kept.
    kml.run('UKE_kml_plus', 'PLS0001', 51.0, 17.0, ops('Plus'));
    db.prepare("INSERT INTO comments(id,towerId,userNick,text,createdAt) VALUES('c1','UKE_kml_twin','Anna','Fajny maszt','2026-11-01')").run();
    db.prepare("INSERT INTO pem_report_counts(towerId,count,partial,checkedAt) VALUES('UKE_kml_twin',3,0,'2026-11-01')").run();

    const result = await syncUkeWykaz(db, options);
    assert.equal(result.updated, true);
    const ids = db.prepare('SELECT id FROM towers ORDER BY id').all().map(r => String(r.id));
    const registryId = ids.find(id => !id.startsWith('UKE_kml'))!;
    assert.deepEqual(ids.filter(id => id.startsWith('UKE_kml')), ['UKE_kml_far', 'UKE_kml_other_op', 'UKE_kml_plus']);
    assert.equal(ids.length, 4);
    const merged = JSON.parse(String(db.prepare('SELECT operators FROM towers WHERE id=?').get(registryId)!.operators));
    assert.deepEqual(merged[0].azimuths, [10, 130, 250], 'azimuths of the KML copy are kept');
    assert.deepEqual(merged[0].bands.map((b: {tech: string; band: string}) => `${b.tech} ${b.band}`).sort(), ['5G 3600', 'LTE 1800'], 'bands come from the registry');
    assert.equal(String(db.prepare("SELECT towerId FROM comments WHERE id='c1'").get()!.towerId), registryId, 'comments follow the station');
    assert.equal(db.prepare("SELECT 1 FROM pem_report_counts WHERE towerId='UKE_kml_twin'").get(), undefined);

    // A database synced by an older version re-reads the unchanged registry once, then not again.
    db.prepare("DELETE FROM metadata WHERE key='ukeSyncFormat'").run();
    assert.equal((await syncUkeWykaz(db, options)).updated, true);
    assert.equal((await syncUkeWykaz(db, options)).updated, false);
  } finally { db.close(); rmSync(tempDir, {recursive: true, force: true}); }
});

/** A minimal .xlsx (stored ZIP entries) with the given sheets, rows written as inline strings and numbers. */
function buildXlsx(path: string, sheets: Record<string, unknown[][]>) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const col = (i: number) => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + (i % 26));
  const names = Object.keys(sheets);
  const files: Record<string, string> = {
    'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns:r="r"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0"?><Relationships>${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="ws" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
    // One shared string, used by the first header cell, so both cell kinds are read.
    'xl/sharedStrings.xml': '<?xml version="1.0"?><sst><si><t>Nr kolejny wpisu</t></si></sst>',
  };
  names.forEach((n, i) => {
    const rows = sheets[n].map((row, r) => `<row r="${r + 1}">${row.map((v, c) => {
      const ref = `${col(c)}${r + 1}`;
      if (v === null || v === undefined) return `<c r="${ref}"/>`;
      if (v === 'Nr kolejny wpisu') return `<c r="${ref}" t="s"><v>0</v></c>`;
      return typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${esc(String(v))}</t></is></c>`;
    }).join('')}</row>`).join('');
    files[`xl/worksheets/sheet${i + 1}.xml`] = `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData><rowBreaks count="0"/></worksheet>`;
  });
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8'), nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data); centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  writeFileSync(path, Buffer.concat([...locals, directory, end]));
}

test('a device-register workbook is read from both sheets, streamed', async () => {
  // Layout as in 2026-11-13_orange.xlsx on BIP UKE (register of devices used without a permit).
  const dir = mkdtempSync(join(tmpdir(), 'btmap-reg-'));
  try {
    const path = join(dir, '2026-11-13_orange.xlsx');
    buildXlsx(path, {
      Wpisy: [
        ['Nr kolejny wpisu', 'Data otrzymania wniosku', 'Data dokonania wpisu', 'Nazwa Podmiotu', 'Nr alternatywny', 'Status'],
        [127799, 46060, 46071, 'Orange Polska S.A.', 'REJ/15/15429/3/26', 'aktualny'],
        [100000, 45000, 45001, 'Orange Polska S.A.', 'REJ/15/999/1/25', 'nieaktualny'],
      ],
      'Warunki wykorzystania': [
        ['Nr alternatywny', 'Rodzaj wniosku', 'Id stacji', 'Miejscowość', 'Ulica', 'Nr domu', 'Dł geogr.', 'Szer. geogr.', 'Kod GUS', 'Rodzaj systemu komórki', 'Azymut', 'Dl geogr. śr.'],
        ['REJ/15/15429/3/26', 'M', '15429', 'Józefów', 'Marszałka Piłsudskiego', '1', 211426, 520754, '1417011', 'GSM900', 309, 211139],
        ['REJ/15/15429/3/26', 'M', '15429', 'Józefów', 'Marszałka Piłsudskiego', '1', 211426, 520754, '1417011', 'LTE800', 120, 211139],
        ['REJ/15/15429/3/26', 'M', '15429', 'Józefów', 'Marszałka Piłsudskiego', '1', 211426, 520754, '1417011', 'GSM900', 30, 211139],
        // An entry that is no longer current is not on air.
        ['REJ/15/999/1/25', 'N', '999', 'Radom', null, null, 211000, 512400, '1463011', 'LTE800', 0, 211000],
      ],
    });
    const file: RegisterFile = {url: 'x', filename: '2026-11-13_orange.xlsx', date: '2026-11-13', operator: 'orange'};
    const stations = await readRegisterWorkbook(path, file, {parseCoord: parseDmsCoord, mapOperator: mapOperatorName});
    assert.equal(stations.length, 1);
    const [st] = stations;
    assert.deepEqual([st.stationId, st.operator, st.address, st.teryt, st.lat, st.lng], ['15429', 'Orange', 'Józefów, Marszałka Piłsudskiego 1', '1417011', 52.131667, 21.240556]);
    assert.deepEqual(st.bands, [
      {tech: 'GSM', band: '900', permit: 'REJ/15/15429/3/26 [wpis]', entryDate: '2026-02-18', azimuths: [30, 309]},
      {tech: 'LTE', band: '800', permit: 'REJ/15/15429/3/26 [wpis]', entryDate: '2026-02-18', azimuths: [120]},
    ]);

    // An unknown layout is an error, not an empty register.
    await assert.rejects(parseRegisterSheets([['Nr alternatywny']], [['Kolumna'], ['x']], 'orange', {parseCoord: parseDmsCoord, mapOperator: mapOperatorName}), /nieznany układ.*Id stacji/);
    assert.deepEqual(parseCellSystem('5G3600'), {tech: '5G', band: '3600'});
    assert.deepEqual(parseCellSystem('NR700'), {tech: '5G', band: '700'});
    assert.equal(parseCellSystem('DECT'), null);
    assert.deepEqual(selectRegisterFiles(registerPage('2026-10-28_polkomtel.xlsx', '2026-11-13_t-mobile.xlsx', 'instrukcja.xlsx')).map(f => [f.operator, f.date]), [['polkomtel', '2026-10-28'], ['t-mobile', '2026-11-13']]);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('stations of the device register join the registry: merged by site, cached, and followed when republished', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'btmap-uke-'));
  const cacheDir = mkdtempSync(join(tmpdir(), 'btmap-regcache-'));
  const db = openDatabase(':memory:');
  try {
    const {state, options} = fakeUke(tempDir, cacheDir);
    state.files = [LTE, NR];
    state.sheets.set(LTE, [HEADER, row('Orange Polska S.A.', 'MNET/1/1/4/26', 21.240556, 52.131667, '15429')]);
    state.sheets.set(NR, [HEADER, row('Orange Polska S.A.', 'MNET/1/1/4/26', 21.240556, 52.131667, '15429')]);
    const ORANGE = '2026-11-13_orange.xlsx', PLUS = '2026-10-28_polkomtel.xlsx';
    state.registerFiles = [PLUS, ORANGE];
    const site = (operator: string, stationId: string, lat: number, lng: number, bands: RegisterStation['bands']): RegisterStation => ({stationId, lat, lng, operator, address: 'Józefów', teryt: '1417011', bands});
    state.registers.set(ORANGE, [site('Orange', '15429', 52.131667, 21.240556, [{tech: 'LTE', band: '800', permit: 'REJ/15/15429/3/26 [wpis]', entryDate: '2026-11-10', azimuths: [120, 240]}])]);
    state.registers.set(PLUS, [site('Plus', '50123', 50.5, 19.5, [{tech: '5G', band: '3600', permit: 'REJ/26/50123/1/26 [wpis]', entryDate: '2026-10-20'}])]);

    const first = await syncUkeWykaz(db, options);
    assert.equal(first.updated, true);
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS c FROM towers').get()!.c), 2, 'the Orange site from permits and register is one station');
    assert.deepEqual(bandsOf(db, '15429'), ['5G 3600', 'LTE 1800', 'LTE 800']);
    const orange = JSON.parse(String(db.prepare("SELECT operators FROM towers WHERE stationId='15429'").get()!.operators));
    assert.deepEqual(orange[0].azimuths, [120, 240], 'register azimuths are the registry azimuths of the operator');
    assert.equal(orange[0].bands.find((b: {band: string}) => b.band === '800').entryDate, '2026-11-10');
    const plus = db.prepare("SELECT source, addedBy, operators FROM towers WHERE stationId='50123'").get()!;
    assert.deepEqual([plus.source, plus.addedBy], ['UKE', 'AutoSync BIP UKE']);
    assert.equal(JSON.parse(String(plus.operators))[0].bands[0].status, 'Rejestr');
    assert.deepEqual(JSON.parse(meta(db, 'ukeRegisterFiles')), [{operator: 'polkomtel', date: '2026-10-28'}, {operator: 'orange', date: '2026-11-13'}]);

    // Nothing republished: nothing to do.
    assert.equal((await syncUkeWykaz(db, options)).updated, false);

    // Only the Orange register is republished: the sync runs, and the Plus workbook comes from the cache.
    state.registerReads.length = 0;
    const ORANGE2 = '2026-11-20_orange.xlsx';
    state.registerFiles = [PLUS, ORANGE2];
    state.registers.set(ORANGE2, [site('Orange', '15429', 52.131667, 21.240556, [{tech: 'LTE', band: '800', permit: 'REJ/15/15429/4/26 [wpis]', entryDate: '2026-11-19'}])]);
    assert.equal((await syncUkeWykaz(db, options)).updated, true);
    assert.deepEqual(state.registerReads, [ORANGE2]);
    assert.equal(JSON.parse(String(db.prepare("SELECT operators FROM towers WHERE stationId='15429'").get()!.operators))[0].bands.find((b: {band: string}) => b.band === '800').permit, 'REJ/15/15429/4/26 [wpis]');

    // A register page that suddenly lists nothing looks like a layout change: the database is left alone.
    state.registerFiles = [];
    state.files = [LTE.replace('10-26', '11-23'), NR.replace('10-26', '11-23')];
    state.sheets.set(state.files[0], state.sheets.get(LTE)!);
    state.sheets.set(state.files[1], state.sheets.get(NR)!);
    await assert.rejects(syncUkeWykaz(db, options), /rejestru urządzeń.*nie znaleziono plików/);
    assert.ok(db.prepare("SELECT 1 FROM towers WHERE stationId='50123'").get(), 'register stations stay');

    // A register workbook that cannot be read fails the sync instead of dropping its stations.
    state.registerFiles = [PLUS, '2026-11-27_orange.xlsx'];
    await assert.rejects(syncUkeWykaz(db, options), /rejestru urządzeń 2026-11-27_orange\.xlsx/);
    assert.ok(db.prepare("SELECT 1 FROM towers WHERE stationId='50123'").get());
  } finally { db.close(); rmSync(tempDir, {recursive: true, force: true}); rmSync(cacheDir, {recursive: true, force: true}); }
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
