import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { streamSheetRows } from './xlsxStream.ts';

/**
 * The UKE register of radio devices used without a permit ("Rejestr urządzeń", art. 147-151 PKE).
 * Operators move their base stations from permits to register entries (REJ/…), so for some of them
 * (Polkomtel/Plus above all) the permit lists hold almost nothing and the stations are only here.
 * One workbook per operator, republished on its own date: "2026-11-13_orange.xlsx".
 */
export const UKE_REGISTER_URL = 'https://bip.uke.gov.pl/pozwolenia-radiowe/rejestr-urzadzen/';

export interface RegisterFile { url: string; filename: string; date: string; operator: string }

/** Antenna heights above ground ("H anteny") of the band's cells, in metres, as UKE lists them. */
export interface RegisterBand { tech: string; band: string; permit: string; entryDate?: string; azimuths?: number[]; heightsM?: number[] }
export interface RegisterStation {
  stationId: string;
  lat: number;
  lng: number;
  operator: string;
  address: string;
  teryt: string;
  bands: RegisterBand[];
}

export function selectRegisterFiles(html: string, origin = 'https://bip.uke.gov.pl'): RegisterFile[] {
  const files: RegisterFile[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/href="(\/download\/[^"]+?\.xlsx)"/gi)) {
    const url = origin + m[1];
    if (seen.has(url)) continue;
    seen.add(url);
    const filename = basename(new URL(url).pathname);
    const parts = filename.match(/^(\d{4}-\d{2}-\d{2})_(.+)\.xlsx$/i);
    if (!parts) continue;
    files.push({ url, filename, date: parts[1], operator: parts[2].toLowerCase() });
  }
  return files;
}

/** "LTE800" → LTE 800, "5G3600" → 5G 3600, "NR700" → 5G 700. */
export function parseCellSystem(raw: unknown): { tech: string; band: string } | null {
  const m = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '').match(/^(5G|NR|LTE|UMTS|GSM-R|GSM|CDMA|IOT)-?(\d{3,4})$/);
  if (!m) return null;
  return { tech: m[1] === 'NR' ? '5G' : m[1], band: m[2] };
}

const excelDate = (value: unknown): string | undefined => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return /^\d{4}-\d{2}-\d{2}/.test(String(value ?? '')) ? String(value).slice(0, 10) : undefined;
  return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
};

type Rows = AsyncIterable<unknown[]> | Iterable<unknown[]>;

export interface RegisterParseHelpers {
  parseCoord: (raw: unknown) => number | null;
  mapOperator: (raw: unknown) => string;
}

/**
 * Stations of one register workbook: "Wpisy" (one row per entry: holder, entry date) and
 * "Warunki wykorzystania" (one row per cell: station, coordinates, system, azimuth).
 */
export async function parseRegisterSheets(entries: Rows, cells: Rows, fallbackOperator: string, helpers: RegisterParseHelpers): Promise<RegisterStation[]> {
  const header = (row: unknown[]) => row.map(h => String(h ?? '').trim().toLowerCase());

  const entryInfo = new Map<string, { holder: string; date?: string }>();
  let entryCols: Record<string, number> | null = null;
  for await (const row of entries) {
    if (!entryCols) {
      const h = header(row);
      entryCols = { alt: h.indexOf('nr alternatywny'), holder: h.indexOf('nazwa podmiotu'), date: h.indexOf('data dokonania wpisu'), status: h.indexOf('status') };
      if (entryCols.alt < 0) throw new Error('Arkusz „Wpisy” rejestru urządzeń ma nieznany układ – brak kolumny „Nr alternatywny”.');
      continue;
    }
    const alt = String(row[entryCols.alt] ?? '').trim();
    if (!alt) continue;
    const status = entryCols.status >= 0 ? String(row[entryCols.status] ?? '').trim().toLowerCase() : 'aktualny';
    if (status && status !== 'aktualny') continue;
    entryInfo.set(alt, { holder: String(row[entryCols.holder] ?? '').trim(), date: excelDate(row[entryCols.date]) });
  }

  const stations = new Map<string, RegisterStation & { bandIndex: Map<string, RegisterBand> }>();
  let c: Record<string, number> | null = null;
  let dataRows = 0;
  for await (const row of cells) {
    if (!c) {
      const h = header(row);
      const find = (...names: string[]) => names.map(n => h.indexOf(n)).find(i => i >= 0) ?? -1;
      c = {
        alt: find('nr alternatywny'), station: find('id stacji'), city: find('miejscowość'), street: find('ulica'), house: find('nr domu'),
        lng: find('dł geogr.', 'dł. geogr.'), lat: find('szer. geogr.', 'szer geogr.'), teryt: find('kod gus', 'teryt'),
        system: find('rodzaj systemu komórki'), azimuth: find('azymut'), height: find('h anteny'),
      };
      const missing = Object.entries({ 'Nr alternatywny': c.alt, 'Id stacji': c.station, 'Dł geogr.': c.lng, 'Szer. geogr.': c.lat, 'Rodzaj systemu komórki': c.system })
        .filter(([, i]) => i < 0).map(([name]) => name);
      if (missing.length) throw new Error(`Arkusz „Warunki wykorzystania” rejestru urządzeń ma nieznany układ – brak kolumn: ${missing.join(', ')}.`);
      continue;
    }
    if (!row.length) continue;
    dataRows++;
    const alt = String(row[c.alt] ?? '').trim();
    const entry = entryInfo.get(alt);
    // Rows of an entry that is no longer current (or missing from the entry list) are not on air.
    if (entryInfo.size && !entry) continue;
    const lat = helpers.parseCoord(row[c.lat]);
    const lng = helpers.parseCoord(row[c.lng]);
    if (lat === null || lng === null || lat < 49 || lat > 55 || lng < 14 || lng > 25) continue;
    const system = parseCellSystem(row[c.system]);
    if (!system) continue;
    const stationId = String(row[c.station] ?? '').trim();
    const operator = helpers.mapOperator(entry?.holder || fallbackOperator);
    const key = `${lat.toFixed(6)},${lng.toFixed(6)}|${operator}|${stationId}`;
    let station = stations.get(key);
    if (!station) {
      const street = [row[c.street], row[c.house]].map(v => String(v ?? '').trim()).filter(Boolean).join(' ');
      station = {
        stationId, lat, lng, operator,
        address: [String(row[c.city] ?? '').trim(), street].filter(Boolean).join(', '),
        teryt: c.teryt >= 0 ? String(row[c.teryt] ?? '').trim() : '',
        bands: [], bandIndex: new Map(),
      };
      stations.set(key, station);
    }
    const bandKey = `${system.tech}|${system.band}|${alt}`;
    let band = station.bandIndex.get(bandKey);
    if (!band) {
      band = { tech: system.tech, band: system.band, permit: alt ? `${alt} [wpis]` : '', ...(entry?.date ? { entryDate: entry.date } : {}) };
      station.bandIndex.set(bandKey, band);
      station.bands.push(band);
    }
    const height = c.height >= 0 && String(row[c.height] ?? '').trim() !== '' ? Number(String(row[c.height]).replace(',', '.')) : NaN;
    if (Number.isFinite(height) && height > 0 && height < 400) {
      const list = band.heightsM || (band.heightsM = []);
      const rounded = Math.round(height * 10) / 10;
      if (!list.includes(rounded)) list.push(rounded);
    }
    const azimuth = c.azimuth >= 0 ? Number(row[c.azimuth]) : NaN;
    if (Number.isFinite(azimuth) && azimuth >= 0 && azimuth < 360 && String(row[c.azimuth] ?? '').trim() !== '') {
      const list = band.azimuths || (band.azimuths = []);
      if (!list.includes(Math.round(azimuth))) list.push(Math.round(azimuth));
    }
  }
  if (dataRows > 0 && stations.size === 0) {
    throw new Error(`Żaden z ${dataRows} wierszy rejestru urządzeń nie dał się umieścić na mapie (nieznany format współrzędnych lub systemu).`);
  }
  return [...stations.values()].map(({ bandIndex: _index, ...station }) => ({
    ...station,
    bands: station.bands.map(b => ({
      ...b,
      ...(b.azimuths ? { azimuths: [...b.azimuths].sort((x, y) => x - y) } : {}),
      ...(b.heightsM ? { heightsM: [...b.heightsM].sort((x, y) => x - y) } : {}),
    })),
  }));
}

/** Reads one register workbook from disk, streaming its sheets. */
export async function readRegisterWorkbook(xlsxPath: string, file: RegisterFile, helpers: RegisterParseHelpers): Promise<RegisterStation[]> {
  return parseRegisterSheets(streamSheetRows(xlsxPath, 'Wpisy'), streamSheetRows(xlsxPath, 'Warunki wykorzystania'), file.operator, helpers);
}

export interface RegisterLoadOptions {
  fetcher: typeof fetch;
  cacheDir: string;
  helpers: RegisterParseHelpers;
  readRegister?: (xlsxPath: string, file: RegisterFile) => Promise<RegisterStation[]>;
  retryDelayMs?: number;
}

/**
 * Bumped when the parser reads more from a workbook, so cached results made by an older parser are read
 * again. 2: antenna heights ("H anteny").
 */
const REGISTER_PARSER_VERSION = 2;
const cacheName = (url: string) => `${createHash('sha256').update(`v${REGISTER_PARSER_VERSION}:${url}`).digest('hex').slice(0, 24)}.json`;

async function download(url: string, target: string, fetcher: typeof fetch, retryDelayMs: number) {
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // The files are large (up to a few hundred MB), so they go straight to disk.
      const res = await fetcher(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, signal: AbortSignal.timeout(15 * 60 * 1000) });
      if (res.ok && res.body) {
        await pipeline(Readable.fromWeb(res.body as never), createWriteStream(target));
        return;
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = (err as Error).message;
    }
    if (attempt < 3) await new Promise(done => setTimeout(done, retryDelayMs * attempt));
  }
  throw new Error(`Nie udało się pobrać ${basename(target)} (${lastError}).`);
}

/**
 * Stations of every listed register workbook. A workbook already read is taken from the cache, so an
 * unchanged file (same URL) is never downloaded again; cached files no longer listed are dropped.
 * Any workbook that cannot be read is an error: leaving it out would strip its stations from the map.
 */
export async function loadRegisterStations(files: RegisterFile[], options: RegisterLoadOptions): Promise<RegisterStation[]> {
  const { fetcher, cacheDir, helpers, retryDelayMs = 2000 } = options;
  const read = options.readRegister || ((path: string, file: RegisterFile) => readRegisterWorkbook(path, file, helpers));
  mkdirSync(cacheDir, { recursive: true });
  const all: RegisterStation[] = [];
  const keep = new Set<string>();
  for (const file of files) {
    const cachePath = resolve(cacheDir, cacheName(file.url));
    keep.add(basename(cachePath));
    let stations: RegisterStation[] | null = null;
    if (existsSync(cachePath)) {
      try { stations = JSON.parse(readFileSync(cachePath, 'utf8')) as RegisterStation[]; } catch { stations = null; }
    }
    if (!stations) {
      const xlsxPath = resolve(cacheDir, file.filename);
      try {
        console.log(`[UKE Sync] Pobieranie rejestru urządzeń: ${file.filename}...`);
        await download(file.url, xlsxPath, fetcher, retryDelayMs);
        stations = await read(xlsxPath, file);
      } catch (err) {
        throw new Error(`Nie udało się wczytać rejestru urządzeń ${file.filename}: ${(err as Error).message}`);
      } finally {
        rmSync(xlsxPath, { force: true });
      }
      writeFileSync(cachePath, JSON.stringify(stations));
      console.log(`[UKE Sync] Rejestr urządzeń ${file.filename}: ${stations.length} stacji.`);
    }
    all.push(...stations);
  }
  for (const name of readdirSync(cacheDir)) {
    if (name.endsWith('.json') && !keep.has(name)) rmSync(resolve(cacheDir, name), { force: true });
  }
  return all;
}
