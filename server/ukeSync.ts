import { mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import readXlsxFile from 'read-excel-file/node';
import { operatorColor, operatorName as canonicalOperatorName } from '../shared/operators.ts';
import { ensureRegistrySnapshot, recordRegistrySnapshot } from './stats.ts';
import { carryOverAzimuths, normalizeAzimuths } from './kmlAzimuths.ts';

const BIP_UKE_URL = 'https://bip.uke.gov.pl/pozwolenia-radiowe/wykaz-pozwolen-radiowych-tresci/stacje-gsm-umts-lte-5gnr-oraz-cdma,12,0.html';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

const TERYT_PROVINCE_MAP: Record<string, string> = {
  '02': 'Dolnośląskie',
  '04': 'Kujawsko-pomorskie',
  '06': 'Lubelskie',
  '08': 'Lubuskie',
  '10': 'Łódzkie',
  '12': 'Małopolskie',
  '14': 'Mazowieckie',
  '16': 'Opolskie',
  '18': 'Podkarpackie',
  '20': 'Podlaskie',
  '22': 'Pomorskie',
  '24': 'Śląskie',
  '26': 'Świętokrzyskie',
  '28': 'Warmińsko-mazurskie',
  '30': 'Wielkopolskie',
  '32': 'Zachodniopomorskie',
};

const PROVINCE_CENTROIDS: Array<{ province: string; lat: number; lng: number }> = [
  { province: 'Dolnośląskie', lat: 51.0511, lng: 16.4876 },
  { province: 'Kujawsko-pomorskie', lat: 53.0767, lng: 18.4478 },
  { province: 'Lubelskie', lat: 51.2339, lng: 22.7937 },
  { province: 'Lubuskie', lat: 52.1863, lng: 15.3319 },
  { province: 'Mazowieckie', lat: 52.2314, lng: 21.0260 },
  { province: 'Małopolskie', lat: 49.9182, lng: 20.1218 },
  { province: 'Opolskie', lat: 50.6308, lng: 17.9006 },
  { province: 'Podkarpackie', lat: 49.9773, lng: 22.1049 },
  { province: 'Podlaskie', lat: 53.2591, lng: 22.9192 },
  { province: 'Pomorskie', lat: 54.2923, lng: 18.2587 },
  { province: 'Warmińsko-mazurskie', lat: 53.8420, lng: 20.7159 },
  { province: 'Wielkopolskie', lat: 52.2989, lng: 17.1791 },
  { province: 'Zachodniopomorskie', lat: 53.6394, lng: 15.3183 },
  { province: 'Łódzkie', lat: 51.6632, lng: 19.4642 },
  { province: 'Śląskie', lat: 50.2560, lng: 18.9569 },
  { province: 'Świętokrzyskie', lat: 50.8143, lng: 20.7825 },
];

export function inferProvinceFromTerytOrCoords(teryt: string, lat: number, lng: number): string {
  const cleanTeryt = teryt.replace(/\D/g, '').padStart(7, '0');
  const code = cleanTeryt.slice(0, 2);
  if (TERYT_PROVINCE_MAP[code]) return TERYT_PROVINCE_MAP[code];

  let best = 'Mazowieckie';
  let bestDist = Infinity;
  for (const c of PROVINCE_CENTROIDS) {
    const dLat = lat - c.lat;
    const dLng = (lng - c.lng) * 0.62;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < bestDist) {
      bestDist = dist;
      best = c.province;
    }
  }
  return best;
}

/**
 * Degrees packed as a number DDMMSS (or DDDMMSS), e.g. 530806 = 53°08'06". Some UKE sheets (the
 * private-network list) store coordinates this way; read as decimal degrees they are far out of range.
 */
function packedDms(value: number): number | null {
  if (Math.abs(value) <= 180) return value;
  const sign = value < 0 ? -1 : 1;
  const n = Math.abs(value);
  const deg = Math.floor(n / 10000), min = Math.floor(n / 100) % 100, sec = n % 100;
  if (deg > 180 || min >= 60 || sec >= 60) return null;
  return sign * Math.round((deg + min / 60 + sec / 3600) * 1e6) / 1e6;
}

export function parseDmsCoord(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return packedDms(raw);
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const plain = parseFloat(s.replace(',', '.'));
  if (Number.isFinite(plain) && /^[+-]?\d+([.,]\d+)?$/.test(s)) return packedDms(plain);

  const match = s.match(/(\d+)\s*[°\D]?\s*([NnSsEeWw])?\s*(\d+)\s*['\s]\s*(\d+(?:[.,]\d+)?)/);
  if (match) {
    const deg = parseFloat(match[1]);
    const min = parseFloat(match[3]);
    const sec = parseFloat(match[4].replace(',', '.'));
    const dec = deg + min / 60 + sec / 3600;
    const dir = (match[2] || (s.match(/[NnSsEeWw]/) || [])[0] || '').toUpperCase();
    return (dir === 'S' || dir === 'W') ? -dec : dec;
  }
  return null;
}

/**
 * Technology and band of a registry file, from its name ("lte1800_-_stan_na_2026-10-26.xlsx").
 * A file that names only a frequency range ("sieci_prywatne_3800-4200_mhz_...") is imported under that
 * frequency with the technology left as "Inne". A file that names neither is not a station list we can
 * place on the map, so it is skipped (null) instead of being stored as "Inne 0 MHz".
 */
export function parseTechAndBand(filename: string): { tech: string; band: string } | null {
  const name = basename(filename).toLowerCase();
  const m = name.match(/^(5g|lte|gsm-r|gsm|umts|cdma|iot)(\d+)?/);
  if (m) {
    const tech = m[1].toUpperCase();
    const band = m[2] || (tech === 'GSM-R' || tech === 'IOT' ? '900' : '0');
    return { tech, band };
  }
  const frequency = name.match(/(\d{3,5})(?:-\d{3,5})?[_\s-]*mhz/);
  return frequency ? { tech: 'Inne', band: frequency[1] } : null;
}

export interface RegistryFile { url: string; filename: string; tech: string; band: string; date: string; recognised: boolean }

/**
 * The registry files linked from the BIP UKE page.
 * - `date` is the date of the technology lists (the registry itself). Files published on their own
 *   schedule, such as the private-network list, do not move it.
 * - `fingerprint` changes whenever any linked file changes, so a new version of any file triggers a sync.
 */
export function selectRegistryFiles(html: string, origin = 'https://bip.uke.gov.pl'): { files: RegistryFile[]; skipped: string[]; date: string; fingerprint: string } {
  const files: RegistryFile[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  const linkRegex = /href="(\/download\/[^"]+?\.xlsx)"/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    const url = origin + match[1];
    if (seen.has(url)) continue;
    seen.add(url);
    const filename = basename(new URL(url).pathname);
    const parsed = parseTechAndBand(filename);
    if (!parsed) { skipped.push(filename); continue; }
    files.push({ url, filename, ...parsed, date: filename.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || '', recognised: parsed.tech !== 'Inne' });
  }
  const dates = (list: RegistryFile[]) => list.map(f => f.date).filter(Boolean).sort();
  const date = dates(files.filter(f => f.recognised)).pop() || dates(files).pop() || '';
  const fingerprint = createHash('sha256').update(files.map(f => f.url).sort().join('\n')).digest('hex').slice(0, 24);
  return { files, skipped, date, fingerprint };
}

export function mapOperatorName(rawName: unknown): string {
  const s = String(rawName || '').trim();
  if (/p4\b|play/i.test(s)) return 'Play';
  if (/polkomtel|plus|aero2|towerlink/i.test(s)) return 'Plus';
  if (/orange/i.test(s)) return 'Orange';
  if (/t-mobile/i.test(s)) return 'T-Mobile';
  if (/pkp\b/i.test(s)) return 'PKP PLK';
  if (/pge\b/i.test(s)) return 'PGE Systemy';
  return canonicalOperatorName(s) || s || 'Inne';
}

export async function fetchBipUkeLinks(fetcher: typeof fetch = fetch) {
  const res = await fetcher(BIP_UKE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`BIP UKE zwrócił kod błędu HTTP ${res.status}`);
  return selectRegistryFiles(await res.text());
}

type StationEntry = {
  id: string;
  lat: number;
  lng: number;
  address: string;
  province: string;
  stationId: string;
  teryt: string;
  operators: {
    name: string;
    color: string;
    stationIds: string[];
    bands: { tech: string; band: string; status: string; permit: string }[];
    azimuths?: number[];
  }[];
};

export async function readUkeSheet(filePath: string): Promise<unknown[][]> {
  const rawResult = await readXlsxFile(filePath);
  if (Array.isArray(rawResult)) {
    if (rawResult.length > 0 && typeof rawResult[0] === 'object' && rawResult[0] !== null && 'data' in rawResult[0]) {
      return (rawResult[0] as { data: unknown[][] }).data;
    }
    return Array.isArray(rawResult[0]) ? (rawResult as unknown) as unknown[][] : [];
  }
  if (typeof rawResult === 'object' && rawResult !== null && 'data' in rawResult) {
    return (rawResult as { data: unknown[][] }).data;
  }
  return [];
}

export async function parseUkeXlsx(filePath: string, defaultTech: string, defaultBand: string, stations: Map<string, StationEntry>) {
  return parseUkeRows(await readUkeSheet(filePath), defaultTech, defaultBand, stations);
}

/** Adds the stations of one registry sheet. Returns how many rows were used. */
export function parseUkeRows(rows: unknown[][], defaultTech: string, defaultBand: string, stations: Map<string, StationEntry>): number {
  if (!rows || rows.length < 1) throw new Error('Arkusz wykazu UKE jest pusty (brak wiersza nagłówka).');

  const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
  const col = (name: string) => headers.findIndex(h => h.includes(name));

  const opCol = col('operator');
  const decCol = col('decyzji');
  const typeCol = col('rodzaj');
  const expCol = col('ważności') >= 0 ? col('ważności') : col('waznosci');
  const lngCol = col('dł') >= 0 ? col('dł') : col('dl');
  const latCol = col('szer');
  const cityCol = col('miejscowość') >= 0 ? col('miejscowość') : col('miejscowosc');
  const locCol = col('lokalizacja');
  const idCol = col('idstacji') >= 0 ? col('idstacji') : col('id stacji');
  const terytCol = col('teryt');
  // A sheet without these columns has a layout this parser does not know. Reading it anyway would
  // silently yield no stations and, on save, strip this band from every station.
  const missing = [['operator', opCol], ['szerokość geogr.', latCol], ['długość geogr.', lngCol], ['id stacji', idCol]].filter(([, index]) => (index as number) < 0).map(([name]) => name);
  if (missing.length) throw new Error(`Arkusz wykazu UKE ma nieznany układ – brak kolumn: ${missing.join(', ')}.`);
  let used = 0;
  // Not every registry file has antenna azimuths; when a column is present they are kept with the operator.
  const azimuthCol = col('azymut');
  // Lists that span a frequency range (private networks) give the range per row, e.g. "3900-4000".
  const rangeCol = col('zakres częstotliwości');
  let dataRows = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length || row.every(cell => cell === null || cell === undefined || String(cell).trim() === '')) continue;
    dataRows++;

    const lat = parseDmsCoord(row[latCol]);
    const lng = parseDmsCoord(row[lngCol]);
    if (lat === null || lng === null || lat < 49 || lat > 55 || lng < 14 || lng > 25) continue;

    const operator = mapOperatorName(row[opCol]);
    const stationId = String(row[idCol] || '').trim();
    const coordKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    const key = `${coordKey}|${operator}|${stationId}`;
    const city = String(row[cityCol] || '').trim();
    const loc = String(row[locCol] || '').trim();
    const address = [city, loc].filter(Boolean).join(', ');
    const teryt = String(row[terytCol] || '').trim();
    const province = inferProvinceFromTerytOrCoords(teryt, lat, lng);
    const decNo = String(row[decCol] || '').trim();
    const decType = String(row[typeCol] || '').trim();
    const expVal = row[expCol];
    const expDate = expVal instanceof Date ? expVal.toISOString().slice(0, 10) : String(expVal || '').slice(0, 10);
    const permit = decNo ? `${decNo}${decType ? ` [${decType}]` : ''}${expDate ? ` - expires ${expDate}` : ''}` : '';

    let station = stations.get(key);
    if (!station) {
      const id = 'UKE_' + createHash('sha256').update(key).digest('hex').slice(0, 18);
      station = {
        id,
        lat,
        lng,
        address,
        province,
        stationId,
        teryt,
        operators: [],
      };
      stations.set(key, station);
    }

    if (address && (!station.address || station.address.length < address.length)) {
      station.address = address;
    }
    if (province && !station.province) {
      station.province = province;
    }
    if (stationId && !station.stationId) {
      station.stationId = stationId;
    }
    if (teryt && !station.teryt) {
      station.teryt = teryt;
    }

    let op = station.operators.find(o => o.name === operator);
    if (!op) {
      op = {
        name: operator,
        color: operatorColor(operator),
        stationIds: [],
        bands: [],
      };
      station.operators.push(op);
    }

    if (stationId && !op.stationIds.includes(stationId)) {
      op.stationIds.push(stationId);
    }

    if (azimuthCol >= 0 && row[azimuthCol] !== null && row[azimuthCol] !== undefined) {
      const azimuths = normalizeAzimuths([...(op.azimuths || []), ...String(row[azimuthCol]).split(/[;,/|\s]+/)]);
      if (azimuths.length > 0) op.azimuths = azimuths;
    }

    const rowBand = rangeCol >= 0 ? String(row[rangeCol] ?? '').match(/(\d{3,5})/)?.[1] : undefined;
    const band = rowBand || defaultBand;
    const bandEntry = {
      tech: defaultTech,
      band,
      status: 'Pozwolenie',
      permit,
    };

    if (!op.bands.some(b => b.tech === defaultTech && b.band === band && b.permit === permit)) {
      op.bands.push(bandEntry);
    }
    used++;
  }
  // Rows exist but none could be placed in Poland: the coordinates are in a format this parser does not
  // read. Treated as an error, not as an empty list, so a band is never wiped from every station.
  if (dataRows > 0 && used === 0) {
    throw new Error(`Żaden z ${dataRows} wierszy arkusza nie ma współrzędnych w Polsce w odczytywalnym formacie.`);
  }
  return used;
}

export interface UkeSyncOptions {
  force?: boolean;
  /** Injected in tests. */
  fetcher?: typeof fetch;
  readSheet?: (filePath: string) => Promise<unknown[][]>;
  tempDir?: string;
  retryDelayMs?: number;
  /**
   * Largest share of registry stations one sync may delete. A larger drop is far more likely a truncated
   * file published by UKE than a real change, so the sync stops instead (`force` overrides it).
   */
  maxRemovedShare?: number;
}

/** Stations created by the registry sync itself. Community, KML-imported and other records are never removed by it. */
const REGISTRY_STATION_SQL = "source = 'UKE' AND addedBy = 'AutoSync BIP UKE'";

/**
 * Registry stations that are no longer in the registry just read. A station that has a band from a
 * supplementary file which could not be read this time is kept: its absence proves nothing.
 */
export function findRemovedStations(db: DatabaseSync, keptIds: Set<string>, unreadBands: Set<string>): string[] {
  const rows = db.prepare(`SELECT id, operators FROM towers WHERE ${REGISTRY_STATION_SQL}`).all() as Array<{ id: string; operators: string }>;
  return rows.filter(row => {
    if (keptIds.has(row.id)) return false;
    if (!unreadBands.size) return true;
    try {
      // Matched by technology: a supplementary file may give a different band per row.
      const ops = JSON.parse(row.operators) as Array<{ bands?: Array<{ tech?: string; band?: string }> }>;
      return !ops.some(op => (op.bands || []).some(b => unreadBands.has(String(b.tech))));
    } catch {
      return true;
    }
  }).map(row => row.id);
}

const DOWNLOAD_ATTEMPTS = 3;

async function downloadFile(url: string, targetPath: string, fetcher: typeof fetch, retryDelayMs: number) {
  let lastError = '';
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      const res = await fetcher(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, signal: AbortSignal.timeout(60000) });
      if (res.ok) {
        const data = Buffer.from(await res.arrayBuffer());
        if (data.length > 0) { writeFileSync(targetPath, data); return; }
        lastError = 'pusty plik';
      } else {
        lastError = `HTTP ${res.status}`;
      }
    } catch (err) {
      lastError = (err as Error).message;
    }
    if (attempt < DOWNLOAD_ATTEMPTS) await new Promise(done => setTimeout(done, retryDelayMs * attempt));
  }
  throw new Error(`Nie udało się pobrać ${basename(targetPath)} (${lastError}).`);
}

export async function syncUkeWykaz(db: DatabaseSync, options: UkeSyncOptions = {}): Promise<{ updated: boolean; date: string; message: string }> {
  const { fetcher = fetch, readSheet = readUkeSheet, retryDelayMs = 2000, maxRemovedShare = 0.2 } = options;
  const tempDir = resolve(options.tempDir || 'data/temp_uke');
  const setMeta = (key: string, value: string) => db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(key, value);
  const getMeta = (key: string) => (db.prepare('SELECT value FROM metadata WHERE key = ?').get(key) as { value?: string } | undefined)?.value || '';
  try {
    setMeta('ukeSyncAttemptAt', new Date().toISOString());

    const { files, skipped, date, fingerprint } = await fetchBipUkeLinks(fetcher);
    if (!files.length || !date) {
      throw new Error('Na stronie BIP UKE nie znaleziono plików wykazu stacji – możliwa zmiana układu strony.');
    }
    if (skipped.length) console.warn(`[UKE Sync] Pominięto pliki bez rozpoznanej technologii i częstotliwości: ${skipped.join(', ')}`);

    const lastDate = getMeta('ukeWykazDate');
    const lastFingerprint = getMeta('ukeWykazFiles');
    // Any changed file means there is something new. Databases synced before fingerprints existed fall back to the date.
    const unchanged = lastFingerprint ? lastFingerprint === fingerprint : Boolean(lastDate) && date <= lastDate;
    if (!options.force && unchanged) {
      if (!lastFingerprint) setMeta('ukeWykazFiles', fingerprint);
      setMeta('ukeSyncCheckedAt', new Date().toISOString());
      setMeta('ukeSyncError', '');
      return { updated: false, date: lastDate || date, message: `Wykaz UKE jest aktualny (stan na ${lastDate || date}).` };
    }

    console.log(`[UKE Sync] Znaleziono nowy wykaz UKE (${date}, poprzedni: ${lastDate || 'brak'}). Pobieranie ${files.length} plików...`);

    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    mkdirSync(tempDir, { recursive: true });

    // All or nothing. The save step replaces each station's permits with what was just read, so one
    // missing or unreadable file would erase that band from every station and never be retried.
    // The exception is a supplementary list without a technology (private networks): its stations appear
    // in no other file, so skipping it leaves them as they were and must not block the main registry.
    const stations = new Map<string, StationEntry>();
    const unreadBands = new Set<string>();
    for (const item of files) {
      const targetPath = resolve(tempDir, item.filename);
      try {
        await downloadFile(item.url, targetPath, fetcher, retryDelayMs);
        parseUkeRows(await readSheet(targetPath), item.tech, item.band, stations);
      } catch (err) {
        const reason = `Nie udało się wczytać pliku ${item.filename}: ${(err as Error).message}`;
        if (item.recognised) throw new Error(reason);
        unreadBands.add(item.tech);
        console.warn(`[UKE Sync] ${reason} Plik dodatkowy – pominięto.`);
      }
    }

    if (stations.size === 0) {
      throw new Error('Po sparsowaniu plików liczba stacji wynosi 0. Anulowano aktualizację bazy.');
    }

    // A station UKE no longer lists is gone, so it is removed from the map.
    const removedIds = findRemovedStations(db, new Set([...stations.values()].map(st => st.id)), unreadBands);
    const registryCount = Number((db.prepare(`SELECT COUNT(*) AS c FROM towers WHERE ${REGISTRY_STATION_SQL}`).get() as { c: number }).c);
    if (!options.force && registryCount > 0 && removedIds.length / registryCount > maxRemovedShare) {
      throw new Error(`Nowy wykaz UKE nie zawiera ${removedIds.length} z ${registryCount} stacji (więcej niż ${Math.round(maxRemovedShare * 100)}%). To wygląda na niepełny plik, więc baza pozostaje bez zmian. Jeśli to prawdziwa zmiana, uruchom: pnpm sync:uke --force`);
    }

    console.log(`[UKE Sync] Zapisywanie ${stations.size} stacji do bazy danych...`);
    const now = new Date().toISOString();

    // Offset stations that share identical coordinates so map pins do not overlap
    const coordGroups = new Map<string, StationEntry[]>();
    for (const st of stations.values()) {
      const ck = `${st.lat.toFixed(6)},${st.lng.toFixed(6)}`;
      const list = coordGroups.get(ck) || [];
      list.push(st);
      coordGroups.set(ck, list);
    }
    for (const group of coordGroups.values()) {
      if (group.length > 1) {
        const baseLat = group[0].lat;
        const baseLng = group[0].lng;
        group.forEach((st, idx) => {
          if (idx === 0) return;
          const angle = (idx * 2 * Math.PI) / group.length;
          st.lat = Math.round((baseLat + Math.cos(angle) * 0.000055) * 1000000) / 1000000;
          st.lng = Math.round((baseLng + Math.sin(angle) * 0.000085) * 1000000) / 1000000;
        });
      }
    }

    // Keep the pre-sync state as a baseline if this database has no snapshot yet.
    try { ensureRegistrySnapshot(db); } catch (snapshotErr) { console.warn('[UKE Sync] Nie zapisano migawki bazowej:', (snapshotErr as Error).message); }

    db.exec('BEGIN TRANSACTION;');
    try {
      const insertOrUpdate = db.prepare(`
        INSERT INTO towers (id, stationId, address, province, lat, lng, operators, source, addedBy, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'UKE', 'AutoSync BIP UKE', 'APPROVED', ?)
        ON CONFLICT(id) DO UPDATE SET
          stationId = CASE WHEN excluded.stationId != '' THEN excluded.stationId ELSE towers.stationId END,
          address = CASE WHEN excluded.address != '' THEN excluded.address ELSE towers.address END,
          province = CASE WHEN excluded.province != '' THEN excluded.province ELSE towers.province END,
          operators = excluded.operators
      `);

      const storedOperators = db.prepare('SELECT operators FROM towers WHERE id = ?');
      for (const st of stations.values()) {
        // The sync overwrites operators; azimuths this registry does not carry stay with the station.
        const stored = storedOperators.get(st.id) as { operators?: string } | undefined;
        if (stored?.operators) carryOverAzimuths(st.operators, stored.operators);
        insertOrUpdate.run(
          st.id,
          st.stationId,
          st.address,
          st.province,
          st.lat,
          st.lng,
          JSON.stringify(st.operators),
          now
        );
      }

      const removeTower = db.prepare('DELETE FROM towers WHERE id = ?');
      const removePemCounts = db.prepare('DELETE FROM pem_report_operator_counts WHERE towerId = ?');
      const removePemCount = db.prepare('DELETE FROM pem_report_counts WHERE towerId = ?');
      for (const id of removedIds) {
        removeTower.run(id);
        removePemCounts.run(id);
        removePemCount.run(id);
      }
      if (removedIds.length) console.log(`[UKE Sync] Usunięto ${removedIds.length} stacji, których nie ma już w wykazie UKE.`);

      db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('ukeWykazDate', ?)").run(date);
      db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('ukeWykazFiles', ?)").run(fingerprint);
      db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('ukeSyncRemoved', ?)").run(String(removedIds.length));
      db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('importedAt', ?)").run(now);
      db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('sourceDescription', ?)").run(`Automatyczny wykaz stacji UKE (stan na ${date})`);
      db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('ukeSyncCheckedAt', ?)").run(now);
      db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('ukeSyncError', '')").run();

      db.exec('COMMIT;');
      console.log(`[UKE Sync] Baza pomyślnie zaktualizowana na stan ${date}.`);
      // Growth statistics are the difference between this snapshot and the previous registry's.
      try { recordRegistrySnapshot(db, date); } catch (snapshotErr) { console.warn('[UKE Sync] Nie zapisano migawki statystyk:', (snapshotErr as Error).message); }
    } catch (dbErr) {
      db.exec('ROLLBACK;');
      throw dbErr;
    }

    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
      console.log(`[UKE Sync] Pliki tymczasowe zostały usunięte.`);
    }

    return { updated: true, date, message: `Pomyślnie wgrano nowy wykaz UKE (${date}) obejmujący ${stations.size} stacji${removedIds.length ? `; usunięto ${removedIds.length} stacji, których nie ma już w wykazie` : ''}.` };
  } catch (err) {
    const errorMsg = (err as Error).message;
    console.error(`[UKE Sync] Błąd synchronizacji wykazu UKE:`, errorMsg);
    try {
      db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('ukeSyncError', ?)").run(errorMsg);
    } catch { /* ignore */ }
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    throw err;
  }
}

export function createUkeSync(db: DatabaseSync) {
  let timer: NodeJS.Timeout | null = null;
  let interval: NodeJS.Timeout | null = null;
  let running: Promise<void> | null = null;

  const runSync = (force = false) => {
    // One sync at a time; a second caller waits for the one in progress.
    running ??= syncUkeWykaz(db, { force })
      .then(() => undefined, e => console.error('[UKE Sync Timer] Błąd:', (e as Error).message))
      .finally(() => { running = null; });
    return running;
  };

  return {
    start() {
      timer = setTimeout(() => {
        void runSync();
      }, 20000);
      timer.unref();

      interval = setInterval(() => {
        console.log('[UKE Sync] Cykliczne sprawdzanie nowego wykazu UKE (co 2h)...');
        void runSync();
      }, TWO_HOURS_MS);
      interval.unref();

      console.log('[UKE Sync] Usługa automatycznego sprawdzania wykazu UKE co 2h została uruchomiona.');
    },

    async stop() {
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
      timer = null;
      interval = null;
      // Let a sync in progress finish its transaction before the database is closed.
      await running;
    },

    async syncNow(force = false) {
      return runSync(force);
    },
  };
}
