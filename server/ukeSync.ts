import { mkdirSync, existsSync, rmSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import readXlsxFile from 'read-excel-file/node';
import { operatorColor, operatorName as canonicalOperatorName } from '../shared/operators.ts';

const BIP_UKE_URL = 'https://bip.uke.gov.pl/pozwolenia-radiowe/wykaz-pozwolen-radiowych-tresci/stacje-gsm-umts-lte-5gnr-oraz-cdma,12,0.html';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export function parseDmsCoord(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const plain = parseFloat(s.replace(',', '.'));
  if (Number.isFinite(plain) && /^[+-]?\d+([.,]\d+)?$/.test(s)) return plain;

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

export function parseTechAndBand(filename: string): { tech: string; band: string } {
  const name = basename(filename).toLowerCase();
  const m = name.match(/^(5g|lte|gsm-r|gsm|umts|cdma)(\d+)?/);
  if (!m) return { tech: 'Inne', band: '0' };
  let tech = m[1].toUpperCase();
  if (tech === 'GSM-R') tech = 'GSM-R';
  const band = m[2] || (tech === 'GSM-R' ? '900' : '0');
  return { tech, band };
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

export async function fetchBipUkeLinks(): Promise<{ date: string; links: string[] }> {
  const res = await fetch(BIP_UKE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`BIP UKE zwrócił kod błędu HTTP ${res.status}`);
  const html = await res.text();

  const links: string[] = [];
  const linkRegex = /href="(\/download\/gfx\/bip\/pl\/defaultaktualnosci\/140\/12\/99\/[^"]+\.xlsx)"/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    links.push('https://bip.uke.gov.pl' + match[1]);
  }

  let latestDate = '';
  const dateMatch = html.match(/stan[_\s]+na[_\s]+(\d{4}-\d{2}-\d{2})/i) || html.match(/(\d{4}-\d{2}-\d{2})\.xlsx/i);
  if (dateMatch) {
    latestDate = dateMatch[1];
  } else {
    for (const link of links) {
      const lm = link.match(/(\d{4}-\d{2}-\d{2})/);
      if (lm && (!latestDate || lm[1] > latestDate)) latestDate = lm[1];
    }
  }

  return { date: latestDate, links };
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
  }[];
};

export async function parseUkeXlsx(filePath: string, defaultTech: string, defaultBand: string, stations: Map<string, StationEntry>) {
  const rawResult = await readXlsxFile(filePath);
  const rows = (Array.isArray(rawResult)
    ? (Array.isArray(rawResult[0]) ? rawResult : ((rawResult[0] as unknown as { data?: unknown[][] })?.data || rawResult))
    : ((rawResult as unknown as { data?: unknown[][] })?.data || rawResult)) as unknown[][];
  if (!rows || rows.length < 2) return;

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

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;

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
        province: '',
        stationId,
        teryt,
        operators: [],
      };
      stations.set(key, station);
    }

    if (address && (!station.address || station.address.length < address.length)) {
      station.address = address;
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

    const bandEntry = {
      tech: defaultTech,
      band: defaultBand,
      status: 'Pozwolenie',
      permit,
    };

    if (!op.bands.some(b => b.tech === defaultTech && b.band === defaultBand && b.permit === permit)) {
      op.bands.push(bandEntry);
    }
  }
}

export async function syncUkeWykaz(db: DatabaseSync, options: { force?: boolean } = {}): Promise<{ updated: boolean; date: string; message: string }> {
  const tempDir = resolve('data/temp_uke');
  try {
    db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('ukeSyncAttemptAt', ?)").run(new Date().toISOString());

    const { date, links } = await fetchBipUkeLinks();
    if (!links.length || !date) {
      return { updated: false, date: '', message: 'Nie znaleziono wykazów na stronie BIP UKE.' };
    }

    const lastDateRow = db.prepare("SELECT value FROM metadata WHERE key = 'ukeWykazDate'").get() as { value?: string } | undefined;
    const lastDate = lastDateRow?.value || '';

    if (!options.force && lastDate && date <= lastDate) {
      db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('ukeSyncCheckedAt', ?)").run(new Date().toISOString());
      return { updated: false, date: lastDate, message: `Wykaz UKE jest aktualny (stan na ${lastDate}).` };
    }

    console.log(`[UKE Sync] Znaleziono nowy wykaz UKE (${date}, poprzedni: ${lastDate || 'brak'}). Pobieranie ${links.length} plików...`);

    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    mkdirSync(tempDir, { recursive: true });

    const downloadedFiles: { path: string; tech: string; band: string }[] = [];
    for (const link of links) {
      const filename = basename(new URL(link).pathname);
      const targetPath = resolve(tempDir, filename);
      const res = await fetch(link, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) {
        console.warn(`[UKE Sync] Ostrzeżenie: Nie udało się pobrać ${filename} (${res.status})`);
        continue;
      }
      const arrayBuffer = await res.arrayBuffer();
      writeFileSync(targetPath, Buffer.from(arrayBuffer));

      const { tech, band } = parseTechAndBand(filename);
      downloadedFiles.push({ path: targetPath, tech, band });
    }

    if (!downloadedFiles.length) {
      throw new Error('Nie udało się pobrać żadnego pliku z BIP UKE.');
    }

    console.log(`[UKE Sync] Przetwarzanie ${downloadedFiles.length} arkuszy Excel...`);
    const stations = new Map<string, StationEntry>();
    for (const item of downloadedFiles) {
      try {
        await parseUkeXlsx(item.path, item.tech, item.band, stations);
      } catch (err) {
        console.warn(`[UKE Sync] Błąd parsowania pliku ${basename(item.path)}:`, err);
      }
    }

    if (stations.size === 0) {
      throw new Error('Po sparsowaniu plików liczba stacji wynosi 0. Anulowano aktualizację bazy.');
    }

    console.log(`[UKE Sync] Zapisywanie ${stations.size} stacji do bazy danych...`);
    const now = new Date().toISOString();

    // Offset stations that share identical rounded DMS coordinates so their map pins do not overlap
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

    db.exec('BEGIN TRANSACTION;');
    try {
      const insertOrUpdate = db.prepare(`
        INSERT INTO towers (id, stationId, address, province, lat, lng, operators, source, addedBy, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'UKE', 'AutoSync BIP UKE', 'APPROVED', ?)
        ON CONFLICT(id) DO UPDATE SET
          stationId = excluded.stationId,
          address = CASE WHEN excluded.address != '' THEN excluded.address ELSE towers.address END,
          operators = excluded.operators
      `);

      for (const st of stations.values()) {
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

      db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('ukeWykazDate', ?)").run(date);
      db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('importedAt', ?)").run(now);
      db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('sourceDescription', ?)").run(`Automatyczny wykaz pozwoleń UKE (stan na ${date})`);
      db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('ukeSyncCheckedAt', ?)").run(now);
      db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('ukeSyncError', '')").run();

      db.exec('COMMIT;');
      console.log(`[UKE Sync] Baza pomyślnie zaktualizowana na stan ${date}.`);
    } catch (dbErr) {
      db.exec('ROLLBACK;');
      throw dbErr;
    }

    // Usuwanie pobranych plików i katalogu tymczasowego po poprawnym wgraniu
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
      console.log(`[UKE Sync] Pliki tymczasowe zostały usunięte.`);
    }

    return { updated: true, date, message: `Pomyślnie wgrano nowy wykaz UKE (${date}) obejmujący ${stations.size} stacji.` };
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
  let isRunning = false;

  const runSync = async (force = false) => {
    if (isRunning) return;
    isRunning = true;
    try {
      await syncUkeWykaz(db, { force });
    } catch (e) {
      console.error('[UKE Sync Timer] Błąd:', (e as Error).message);
    } finally {
      isRunning = false;
    }
  };

  return {
    start() {
      // Pierwsze sprawdzenie po 20 sekundach od startu serwera
      timer = setTimeout(() => {
        void runSync();
      }, 20000);
      timer.unref();

      // Sprawdzanie co 2 godziny (7 200 000 ms)
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
    },

    async syncNow(force = false) {
      return runSync(force);
    },
  };
}
