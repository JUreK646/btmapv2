import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {openDatabase} from '../server/database.ts';
import {extractZip} from '../server/zip.ts';
import {calcChannelMbps, syncRadiolinesFromUke} from '../server/radiolineSync.ts';
import {getTelecomStats, invalidateStatsCache} from '../server/stats.ts';
import {makeXlsx, makeZip} from './fixtures/zipWriter.ts';

test('archives are extracted in-process: deflated and stored entries, nested folders, empty files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'btmap-zip-'));
  try {
    const big = randomBytes(300_000).toString('base64').repeat(3);
    writeFileSync(join(dir, 'a.zip'), makeZip({'readme.txt': 'zażółć gęślą jaźń', 'xl/': '', 'xl/worksheets/sheet1.xml': big, 'raw.bin': Buffer.from([0, 1, 2, 255]), 'empty.txt': ''}, ['raw.bin']));
    const names = await extractZip(join(dir, 'a.zip'), join(dir, 'out'));
    assert.deepEqual(names.sort(), ['empty.txt', 'raw.bin', 'readme.txt', 'xl/worksheets/sheet1.xml']);
    assert.equal(readFileSync(join(dir, 'out', 'readme.txt'), 'utf8'), 'zażółć gęślą jaźń');
    assert.equal(readFileSync(join(dir, 'out', 'xl', 'worksheets', 'sheet1.xml'), 'utf8'), big);
    assert.deepEqual([...readFileSync(join(dir, 'out', 'raw.bin'))], [0, 1, 2, 255]);
    assert.equal(readFileSync(join(dir, 'out', 'empty.txt'), 'utf8'), '');

    // An entry may not escape the destination folder, and garbage is not accepted as an archive.
    writeFileSync(join(dir, 'evil.zip'), makeZip({'../outside.txt': 'x'}));
    await assert.rejects(extractZip(join(dir, 'evil.zip'), join(dir, 'out2')), /niedozwoloną ścieżkę/);
    assert.equal(existsSync(join(dir, 'outside.txt')), false);
    writeFileSync(join(dir, 'not.zip'), 'To nie jest archiwum, tylko strona błędu serwera. '.repeat(20));
    await assert.rejects(extractZip(join(dir, 'not.zip'), join(dir, 'out3')), /nie jest archiwum ZIP/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('channel capacity uses the registry figure, then width and modulation, and is otherwise unknown', () => {
  assert.equal(calcChannelMbps('56', '1024QAM', '500'), 500, 'the declared capacity wins over the derived one');
  assert.equal(calcChannelMbps('56', '1024QAM', ''), 476);
  assert.equal(calcChannelMbps('28', 'QPSK', undefined), 48);
  assert.equal(calcChannelMbps('56', '', ''), 0, 'width alone is not turned into a capacity');
  assert.equal(calcChannelMbps('', '', ''), 0, 'no default 100 Mb/s');
  assert.equal(calcChannelMbps(undefined, 'nieznana', '0'), 0);
});

const HEADER = ['L.p.', 'Operator', 'Nr_pozw/dec', 'Rodz_dec', 'Data_wydania', 'Data_ważn_pozw/dec', 'Dl_geo_Tx', 'Sz_geo_Tx', 'Dl_geo_Rx', 'Sz_geo_Rx', 'f [GHz]', 'Polaryzacja', 'Szer_kan [MHz]', 'Rodz_modu-lacji', 'Przepływność [Mb/s]', 'Miejscowość Tx', 'Miejscowość Rx', 'Województwo Tx', 'Typ_ant_Tx'];
const WARSAW = ["21E00'30.0''", "52N13'45.6''"], RADOM = ["21E08'50.0''", "51N24'10.0''"], KRAKOW = ["19E56'20.0''", "50N03'40.0''"], TARNOW = ["20E59'10.0''", "50N00'45.0''"];
const link = (n: number, operator: string, permit: string, tx: string[], rx: string[], freq: string, pol: string, width: string, mod: string, mbps: string, issue = '2027-03-05') =>
  [String(n), operator, permit, 'P', issue, '2037-03-05', tx[0], tx[1], rx[0], rx[1], freq, pol, width, mod, mbps, 'Miasto Tx', 'Miasto Rx', 'mazowieckie', 'VHLP2-18'];

test('a radioline registry is imported without a shell, and unknown values stay unknown', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'btmap-rl-'));
  mkdirSync('data', {recursive: true});
  const db = openDatabase(':memory:');
  try {
    const registry = join(dir, 'linie_radiowe_-_stan_na_2027-03-01.xlsx');
    writeFileSync(registry, makeXlsx([
      HEADER,
      link(1, 'P4 Sp. z o.o.', 'RL/1/27', RADOM, WARSAW, '18.7', 'H', '56', '1024QAM', ''),
      link(2, 'P4 Sp. z o.o.', 'RL/1/27', WARSAW, RADOM, '19.7', 'V', '56', '1024QAM', '500'),
      link(3, 'Orange Polska S.A.', 'RL/2/25', KRAKOW, TARNOW, '', '', '', '', '', '2025-01-10'),
      ['4', 'Bez współrzędnych', 'RL/3/27'],
    ]));

    assert.deepEqual(await syncRadiolinesFromUke(db, {localZipPath: registry}), {importedLinks: 2, totalChannels: 3});
    const rows = db.prepare('SELECT operator, frequency, mode, capacityText, isNew, channelsJson, permitId FROM radiolines ORDER BY permitId').all();
    assert.deepEqual(rows.map(r => [r.operator, r.permitId, r.frequency, r.mode, r.capacityText, r.isNew]), [
      ['Play', 'RL/1/27', 18.7, '1+0', '500 Mbps', 1],
      // No frequency, polarisation or capacity in the registry: none is filled in (it used to be 18 GHz, H and 100 Mbps).
      ['Orange', 'RL/2/25', null, '1+0', null, 0],
    ]);
    const orange = JSON.parse(String(rows[1].channelsJson))[0];
    assert.equal(orange.mbps, 0); assert.equal(orange.pol, ''); assert.equal(orange.freqGHz, 0);
    const play = JSON.parse(String(rows[0].channelsJson)) as Array<{mbps: number; dir: string}>;
    assert.deepEqual(play.map(ch => ch.mbps).sort(), [476, 500]);

    // The link without a frequency is reported as such in the statistics, not under the lowest band.
    invalidateStatsCache();
    assert.deepEqual(getTelecomStats(db, 'UKE').radiolines.bands.map(b => [b.band, b.total]).sort(), [['18 GHz', 1], ['Brak danych', 1]]);

    // A sheet whose layout changed is an error, and so is one with no links: the saved data stays.
    const relaid = join(dir, 'linie_radiowe_-_stan_na_2027-04-01.xlsx');
    writeFileSync(relaid, makeXlsx([['Lp', 'Podmiot', 'Współrzędne'], ['1', 'P4', '52.1, 21.0']]));
    await assert.rejects(syncRadiolinesFromUke(db, {localZipPath: relaid}), /nieznany układ.*Dl_geo_Tx/s);
    const empty = join(dir, 'linie_radiowe_-_stan_na_2027-05-01.xlsx');
    writeFileSync(empty, makeXlsx([HEADER]));
    await assert.rejects(syncRadiolinesFromUke(db, {localZipPath: empty}), /nie znaleziono żadnej linii radiowej/);
    await assert.rejects(syncRadiolinesFromUke(db, {localZipPath: join(dir, 'brak.zip')}), /Nie znaleziono pliku wykazu/);
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS c FROM radiolines').get()!.c), 2);

    // The registry also arrives as a ZIP wrapping the workbook.
    const wrapped = join(dir, 'wykaz.zip');
    writeFileSync(wrapped, makeZip({'linie_radiowe_-_stan_na_2027-06-01.xlsx': makeXlsx([HEADER, link(1, 'T-Mobile Polska S.A.', 'RL/9/27', KRAKOW, TARNOW, '23.0', 'V', '28', '256QAM', '')])}));
    assert.deepEqual(await syncRadiolinesFromUke(db, {localZipPath: wrapped}), {importedLinks: 1, totalChannels: 1});
    assert.deepEqual(db.prepare('SELECT operator, capacityText FROM radiolines').all().map(r => [r.operator, r.capacityText]), [['T-Mobile', '191 Mbps']]);
  } finally { db.close(); rmSync(dir, {recursive: true, force: true}); }
});
