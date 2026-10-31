import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { ensureKmzSchemaAndColumns, normalizeProvinceName, rebuildKmzFiles } from './kmzExport.ts';

const DANE_GOV_DATASET_URL = 'https://api.dane.gov.pl/1.4/datasets/1066/resources';
const FALLBACK_ZIP_URL = 'https://api.dane.gov.pl/media/resources/20260430/wykaz_pozwolen_linie_radiowe.zip';
const HARDWARE_REF_ZIP_URL = 'https://api.dane.gov.pl/media/resources/20260430/wykaz_pozwolen_linie_radiowe.zip';

export interface RadiolineChannelRecord {
  dir: 'A → B' | 'B → A';
  freqGHz: number;
  freqMHz?: number;
  pol: string;
  mbps: number;
  rowId?: string;
  channelNum?: string;
  planSymbol?: string;
  widthMHz?: number;
  modulation?: string;
  eirpDbm?: number;
  txLat?: number;
  txLng?: number;
  txHeightM?: number;
  txCity?: string;
  txProvince?: string;
  txStreet?: string;
  txAntType?: string;
  txAntManufacturer?: string;
  txAntGainDbi?: number;
  txAntHeightM?: number;
  txTransmitterType?: string;
  txManufacturer?: string;
  rxLat?: number;
  rxLng?: number;
  rxHeightM?: number;
  rxCity?: string;
  rxProvince?: string;
  rxStreet?: string;
  rxAntType?: string;
  rxAntManufacturer?: string;
  rxAntGainDbi?: number;
  rxAntHeightM?: number;
  rxNoiseFigureDb?: number;
  rxAttenuationDb?: number;
  permitType?: string;
  issueDate?: string;
  expiryDate?: string;
  snapshotDate?: string;
}

function parseOptNum(val: unknown, decimals = 1): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const n = parseFloat(String(val).replace(',', '.'));
  if (!Number.isFinite(n)) return undefined;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function parseOptStr(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  const s = String(val).trim();
  return s.length > 0 ? s : undefined;
}

function excelSerialToDateStr(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  const s = String(val).trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${d}.${m}.${y}`;
  }
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    const dt = new Date(Math.round((n - 25569) * 86400 * 1000));
    const d = String(dt.getUTCDate()).padStart(2, '0');
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const y = dt.getUTCFullYear();
    return `${d}.${m}.${y}`;
  }
  return s;
}

export function parseDMS(str: unknown): number | null {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d+)([NSEW])(\d+)'([\d.]+)''$/i);
  if (!m) return null;
  const deg = parseFloat(m[1]);
  const dir = m[2].toUpperCase();
  const min = parseFloat(m[3]);
  const sec = parseFloat(m[4]);
  let val = deg + min / 60 + sec / 3600;
  if (dir === 'S' || dir === 'W') val = -val;
  return Math.round(val * 1000000) / 1000000;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(d * 100) / 100;
}

function calcChannelMbps(widthMhz: unknown, modStr: unknown, rawSpeedStr: unknown): number {
  const w = parseFloat(String(widthMhz || ''));
  const mod = String(modStr || '').toUpperCase();
  const qamMatch = mod.match(/(\d+)\s*QAM/);
  if (w > 0 && qamMatch) {
    const qam = parseInt(qamMatch[1], 10);
    const bits = Math.log2(qam);
    if (bits > 0) {
      return Math.round(w * bits * 0.85065);
    }
  }
  if (w > 0 && mod.includes('QPSK')) {
    return Math.round(w * 2 * 0.85065);
  }
  const numMatch = String(rawSpeedStr || '').match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    return Math.round(parseFloat(numMatch[1]));
  }
  if (w > 0) {
    return Math.round(w * 7.5);
  }
  return 100;
}

function normalizeRadiolineOperator(raw: unknown): { operator: string; display: string } {
  const s = String(raw || '').toUpperCase();
  if (s.includes('ORANGE')) return { operator: 'Orange', display: 'Orange Polska' };
  if (s.includes('T-MOBILE')) return { operator: 'T-Mobile', display: 'T-Mobile Polska' };
  if (s.includes('P4') || s.includes('PLAY') || s.includes('ON TOWER')) return { operator: 'Play', display: 'Play' };
  if (
    s.includes('POLKOMTEL') ||
    s.includes('PLUS') ||
    s.includes('TOWERLINK') ||
    s.includes('CELLNEX') ||
    s.includes('AERO')
  ) {
    return {
      operator: 'Plus',
      display: s.includes('TOWERLINK') ? 'Plus (Towerlink)' : 'Plus',
    };
  }
  if (s.includes('NETWORKS')) return { operator: 'Orange', display: 'NetWorkS!' };
  const clean = String(raw || 'Inny operator')
    .replace(/\s+S\.?A\.?$/i, '')
    .replace(/\s+Sp\.\s*z\s*o\.o\.?$/i, '')
    .trim();
  return { operator: 'Inne', display: clean || 'Inny operator' };
}

function colLettersToIndex(letters: string): number {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

async function resolveLatestUkeZipUrl(): Promise<{ url: string; title: string }> {
  try {
    const res = await fetch(DANE_GOV_DATASET_URL);
    if (res.ok) {
      const json = (await res.json()) as {
        data?: Array<{
          attributes?: {
            title?: string;
            format?: string;
            link?: string;
            download_url?: string;
            created?: string;
          };
        }>;
      };
      const items = (json.data || []).filter(
        x => x.attributes?.format === 'zip' && (x.attributes?.link || x.attributes?.download_url)
      );
      items.sort((a, b) =>
        String(b.attributes?.created || '').localeCompare(String(a.attributes?.created || ''))
      );
      if (items.length > 0) {
        return {
          url: String(items[0].attributes!.link || items[0].attributes!.download_url),
          title: String(items[0].attributes!.title || 'Wykaz linii radiowych UKE'),
        };
      }
    }
  } catch {
    // Fallback to known URL
  }
  return {
    url: FALLBACK_ZIP_URL,
    title: 'Wykaz pozwoleń radiowych dla stacji linii radiowych UKE',
  };
}

interface HardwareRefEntry {
  modulation?: string;
  rawMbps?: string;
  rxAttenuationDb?: number;
  txTransmitterType?: string;
  txManufacturer?: string;
  rxNoiseFigureDb?: number;
  txAntType?: string;
  txAntManufacturer?: string;
  txAntGainDbi?: number;
  rxAntType?: string;
  rxAntManufacturer?: string;
  rxAntGainDbi?: number;
}

function parseSharedStrings(extractXlsxDir: string): string[] {
  const sstPath = resolve(extractXlsxDir, 'xl', 'sharedStrings.xml');
  const sharedStrings: string[] = [];
  if (existsSync(sstPath)) {
    const sstXml = readFileSync(sstPath, 'utf8');
    const siRegex = /<si>([\s\S]*?)<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = siRegex.exec(sstXml)) !== null) {
      const inner = m[1];
      const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
      let text = '';
      let tm: RegExpExecArray | null;
      while ((tm = tRegex.exec(inner)) !== null) {
        text += tm[1];
      }
      sharedStrings.push(
        text
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
      );
    }
  }
  return sharedStrings;
}

function makeRowParser(sharedStrings: string[]) {
  return (rowXml: string): string[] => {
    const cells: string[] = [];
    const cRegex = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cRegex.exec(rowXml)) !== null) {
      const colIdx = colLettersToIndex(cm[1]);
      const body = cm[3];
      if (!body) continue;
      const vMatch = body.match(/<v>([\s\S]*?)<\/v>/);
      if (!vMatch) continue;
      cells[colIdx] = cm[2].includes('t="s"')
        ? (sharedStrings[parseInt(vMatch[1], 10)] ?? '')
        : vMatch[1];
    }
    return cells;
  };
}

async function loadHardwareReferenceMap(workDir: string): Promise<Map<string, HardwareRefEntry>> {
  const hwMap = new Map<string, HardwareRefEntry>();
  try {
    const cachedHwZip = resolve(process.cwd(), 'data', 'uke_rl_hw_ref.zip');
    if (!existsSync(cachedHwZip)) {
      console.log(`[Radiolines Sync] Pobieranie słownika sprzętowego UKE (41 kolumn) z: ${HARDWARE_REF_ZIP_URL}`);
      const res = await fetch(HARDWARE_REF_ZIP_URL);
      if (!res.ok) return hwMap;
      writeFileSync(cachedHwZip, Buffer.from(await res.arrayBuffer()));
    }
    const hwZipDir = resolve(workDir, 'hw_zip');
    const hwXlsxDir = resolve(workDir, 'hw_xlsx');
    mkdirSync(hwZipDir, { recursive: true });
    mkdirSync(hwXlsxDir, { recursive: true });
    execSync(`tar -xf "${cachedHwZip}" -C "${hwZipDir}"`);
    const xlsxFile = readdirSync(hwZipDir).find(f => f.toLowerCase().endsWith('.xlsx'));
    if (!xlsxFile) return hwMap;
    execSync(`tar -xf "${resolve(hwZipDir, xlsxFile)}" -C "${hwXlsxDir}"`);

    const sst = parseSharedStrings(hwXlsxDir);
    const parseRow = makeRowParser(sst);
    const sheetPath = resolve(hwXlsxDir, 'xl', 'worksheets', 'sheet1.xml');
    const stream = createReadStream(sheetPath, { encoding: 'utf8', highWaterMark: 1024 * 512 });

    let buffer = '';
    let rowCount = 0;
    const colMap = new Map<string, number>();

    for await (const chunk of stream) {
      buffer += chunk;
      let startIdx = 0;
      while (true) {
        const rowStart = buffer.indexOf('<row ', startIdx);
        if (rowStart === -1) break;
        const rowEnd = buffer.indexOf('</row>', rowStart);
        if (rowEnd === -1) break;
        const rowXml = buffer.slice(rowStart, rowEnd + 6);
        startIdx = rowEnd + 6;
        rowCount++;
        const c = parseRow(rowXml);
        if (rowCount === 1) {
          c.forEach((name, idx) => {
            if (name) colMap.set(name.trim(), idx);
          });
          continue;
        }
        const get = (colName: string) => {
          const idx = colMap.get(colName);
          return idx !== undefined ? c[idx] : undefined;
        };
        const txLon = parseDMS(get('Dl_geo_Tx'));
        const txLat = parseDMS(get('Sz_geo_Tx'));
        const rxLon = parseDMS(get('Dl_geo_Rx'));
        const rxLat = parseDMS(get('Sz_geo_Rx'));
        if (txLat === null || txLon === null || rxLat === null || rxLon === null) continue;

        const freqGHz = parseFloat(get('f [GHz]') || '0') || 0;
        const freqKey = Math.round(freqGHz * 1000);
        const pol = String(get('Polaryzacja') || 'H').trim().toUpperCase();
        const permitId = String(get('Nr_pozw/dec') || '').trim();

        const entry: HardwareRefEntry = {
          modulation: parseOptStr(get('Rodz_modu-lacji')),
          rawMbps: parseOptStr(get('Przepływność [Mb/s]')),
          rxAttenuationDb: parseOptNum(get('Tłum_ant_odb_Rx [dB]'), 1),
          txTransmitterType: parseOptStr(get('Typ_nad')),
          txManufacturer: parseOptStr(get('Prod_nad')),
          rxNoiseFigureDb: parseOptNum(get('Liczba_szum_Rx [dB]'), 1),
          txAntType: parseOptStr(get('Typ_ant_Tx')),
          txAntManufacturer: parseOptStr(get('Prod_ant_Tx')),
          txAntGainDbi: parseOptNum(get('Zysk_ant_Tx [dBi]'), 1),
          rxAntType: parseOptStr(get('Typ_ant_Rx')),
          rxAntManufacturer: parseOptStr(get('Prod_ant_Rx')),
          rxAntGainDbi: parseOptNum(get('Zysk_ant_Rx [dBi]'), 1),
        };

        const coordKey = `${txLat.toFixed(4)},${txLon.toFixed(4)}|${rxLat.toFixed(4)},${rxLon.toFixed(4)}|${freqKey}|${pol}`;
        hwMap.set(coordKey, entry);
        if (permitId) {
          hwMap.set(`P:${permitId}|${freqKey}|${pol}|${txLat.toFixed(3)}`, entry);
        }
      }
      buffer = buffer.slice(startIdx);
    }
    console.log(`[Radiolines Sync] Załadowano słownik sprzętowy dla ${hwMap.size} kluczy kanałów.`);
  } catch (err) {
    console.warn('[Radiolines Sync] Nie udało się załadować słownika sprzętowego:', err);
  }
  return hwMap;
}

export async function syncRadiolinesFromUke(
  db: DatabaseSync,
  options: { localZipPath?: string } = {}
): Promise<{ importedLinks: number; totalChannels: number }> {
  const workDir = resolve(process.cwd(), 'data', '.radiolines_sync_tmp');
  mkdirSync(workDir, { recursive: true });

  try {
    let zipPath = options.localZipPath ? resolve(options.localZipPath) : '';

    if (!zipPath || !existsSync(zipPath)) {
      const cachedZip = resolve(process.cwd(), 'data', 'temp_rl.zip');
      if (existsSync(cachedZip)) {
        console.log(`[Radiolines Sync] Korzystanie z pobranego archiwum UKE: ${cachedZip}`);
        zipPath = cachedZip;
      } else {
        const { url } = await resolveLatestUkeZipUrl();
        console.log(`[Radiolines Sync] Pobieranie wykazu linii radiowych UKE z: ${url}`);
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Błąd pobierania archiwum UKE: HTTP ${res.status}`);
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        zipPath = resolve(workDir, 'uke_radiolines.zip');
        writeFileSync(zipPath, buffer);
        console.log(`[Radiolines Sync] Pobrano ${(buffer.length / 1024 / 1024).toFixed(2)} MB.`);
      }
    }

    const extractZipDir = resolve(workDir, 'zip_contents');
    mkdirSync(extractZipDir, { recursive: true });
    execSync(`tar -xf "${zipPath}" -C "${extractZipDir}"`);

    const xlsxFile = readdirSync(extractZipDir).find(f => f.toLowerCase().endsWith('.xlsx'));
    if (!xlsxFile) {
      throw new Error('Nie znaleziono pliku .xlsx wewnątrz pobranego archiwum UKE.');
    }

    const xlsxPath = resolve(extractZipDir, xlsxFile);
    const dateMatch = xlsxFile.match(/(\d{4})-(\d{2})-(\d{2})/);
    const snapshotDate = dateMatch ? `${dateMatch[3]}.${dateMatch[2]}.${dateMatch[1]}` : undefined;
    const extractXlsxDir = resolve(workDir, 'xlsx_contents');
    mkdirSync(extractXlsxDir, { recursive: true });
    console.log(`[Radiolines Sync] Rozpakowywanie arkusza: ${xlsxFile}...`);
    execSync(`tar -xf "${xlsxPath}" -C "${extractXlsxDir}"`);

    // 1. Parse sharedStrings.xml
    const sharedStrings = parseSharedStrings(extractXlsxDir);
    const parseRowXml = makeRowParser(sharedStrings);

    // 2. Stream sheet1.xml
    const sheetPath = resolve(extractXlsxDir, 'xl', 'worksheets', 'sheet1.xml');
    console.log('[Radiolines Sync] Przetwarzanie kanałów radioliniowych ze strumienia XML...');

    interface AggregatedLink {
      key: string;
      latA: number;
      lngA: number;
      latB: number;
      lngB: number;
      stationA: string;
      stationB: string;
      operator: string;
      operatorRaw: string;
      permitId: string;
      channels: RadiolineChannelRecord[];
    }

    const linksMap = new Map<string, AggregatedLink>();
    const stream = createReadStream(sheetPath, { encoding: 'utf8', highWaterMark: 1024 * 512 });
    let buffer = '';
    let rowCount = 0;
    let totalChannels = 0;
    const colMap = new Map<string, number>();
    let hwMap: Map<string, HardwareRefEntry> | null = null;

    for await (const chunk of stream) {
      buffer += chunk;
      let startIdx = 0;
      while (true) {
        const rowStart = buffer.indexOf('<row ', startIdx);
        if (rowStart === -1) break;
        const rowEnd = buffer.indexOf('</row>', rowStart);
        if (rowEnd === -1) break;

        const rowXml = buffer.slice(rowStart, rowEnd + 6);
        startIdx = rowEnd + 6;
        rowCount++;

        const c = parseRowXml(rowXml);
        if (rowCount === 1) {
          c.forEach((name, idx) => {
            if (name) colMap.set(name.trim(), idx);
          });
          if (!colMap.has('Typ_ant_Tx')) {
            hwMap = await loadHardwareReferenceMap(workDir);
          }
          continue;
        }

        const get = (colName: string): string | undefined => {
          const idx = colMap.get(colName);
          return idx !== undefined ? c[idx] : undefined;
        };

        const txLon = parseDMS(get('Dl_geo_Tx'));
        const txLat = parseDMS(get('Sz_geo_Tx'));
        const rxLon = parseDMS(get('Dl_geo_Rx'));
        const rxLat = parseDMS(get('Sz_geo_Rx'));
        if (txLat === null || txLon === null || rxLat === null || rxLon === null) continue;

        const permitId = String(get('Nr_pozw/dec') || '').trim();
        const rawOp = String(get('Operator') || '').trim();
        const freqGHz = parseFloat(get('f [GHz]') || '0') || 0;
        const freqMHz = freqGHz > 0 ? Math.round(freqGHz * 1000) : undefined;
        const pol = String(get('Polaryzacja') || 'H').trim().toUpperCase();

        const coordKey = `${txLat.toFixed(4)},${txLon.toFixed(4)}|${rxLat.toFixed(4)},${rxLon.toFixed(4)}|${freqMHz ?? 0}|${pol}`;
        const permitKey = permitId ? `P:${permitId}|${freqMHz ?? 0}|${pol}|${txLat.toFixed(3)}` : '';
        const hw = hwMap ? (hwMap.get(permitKey) || hwMap.get(coordKey)) : undefined;

        const rawModulation = get('Rodz_modu-lacji') ?? hw?.modulation;
        const rawMbps = get('Przepływność [Mb/s]') ?? hw?.rawMbps;
        const mbps = calcChannelMbps(get('Szer_kan [MHz]'), rawModulation, rawMbps);

        const isTxA = txLat < rxLat || (txLat === rxLat && txLon <= rxLon);
        const latA = isTxA ? txLat : rxLat;
        const lngA = isTxA ? txLon : rxLon;
        const latB = isTxA ? rxLat : txLat;
        const lngB = isTxA ? rxLon : txLon;
        const cityA = isTxA ? String(get('Miejscowość Tx') || '') : String(get('Miejscowość Rx') || '');
        const cityB = isTxA ? String(get('Miejscowość Rx') || '') : String(get('Miejscowość Tx') || '');
        const dir: 'A → B' | 'B → A' = isTxA ? 'A → B' : 'B → A';

        const key = `${latA.toFixed(5)},${lngA.toFixed(5)}|${latB.toFixed(5)},${lngB.toFixed(5)}|${permitId}`;
        let link = linksMap.get(key);
        if (!link) {
          const opInfo = normalizeRadiolineOperator(rawOp);
          link = {
            key,
            latA,
            lngA,
            latB,
            lngB,
            stationA: cityA,
            stationB: cityB,
            operator: opInfo.operator,
            operatorRaw: opInfo.display,
            permitId,
            channels: [],
          };
          linksMap.set(key, link);
        }

        link.channels.push({
          dir,
          freqGHz: Math.round(freqGHz * 10) / 10,
          freqMHz,
          pol,
          mbps,
          rowId: parseOptStr(get('L.p.') ?? c[0]),
          channelNum: parseOptStr(get('Nr_kan')),
          planSymbol: parseOptStr(get('Symbol_planu')),
          widthMHz: parseOptNum(get('Szer_kan [MHz]'), 1),
          modulation: parseOptStr(rawModulation),
          eirpDbm: parseOptNum(get('EIRP [dBm]'), 1),
          txLat,
          txLng: txLon,
          txHeightM: parseOptNum(get('H_t_Tx [m npm]'), 1),
          txCity: parseOptStr(get('Miejscowość Tx')),
          txProvince: parseOptStr(get('Województwo Tx')),
          txStreet: parseOptStr(get('Ulica Tx')),
          txAntType: parseOptStr(get('Typ_ant_Tx')) ?? hw?.txAntType,
          txAntManufacturer: parseOptStr(get('Prod_ant_Tx')) ?? hw?.txAntManufacturer,
          txAntGainDbi: parseOptNum(get('Zysk_ant_Tx [dBi]'), 1) ?? hw?.txAntGainDbi,
          txAntHeightM: parseOptNum(get('H_ant_Tx [m npt]'), 1),
          txTransmitterType: parseOptStr(get('Typ_nad')) ?? hw?.txTransmitterType,
          txManufacturer: parseOptStr(get('Prod_nad')) ?? hw?.txManufacturer,
          rxLat,
          rxLng: rxLon,
          rxHeightM: parseOptNum(get('H_t_Rx [m npm]'), 1),
          rxCity: parseOptStr(get('Miejscowość Rx')),
          rxProvince: parseOptStr(get('Województwo Rx')),
          rxStreet: parseOptStr(get('Ulica Rx')),
          rxAntType: parseOptStr(get('Typ_ant_Rx')) ?? hw?.rxAntType,
          rxAntManufacturer: parseOptStr(get('Prod_ant_Rx')) ?? hw?.rxAntManufacturer,
          rxAntGainDbi: parseOptNum(get('Zysk_ant_Rx [dBi]'), 1) ?? hw?.rxAntGainDbi,
          rxAntHeightM: parseOptNum(get('H_ant_Rx [m npt]'), 1),
          rxNoiseFigureDb: parseOptNum(get('Liczba_szum_Rx [dB]'), 1) ?? hw?.rxNoiseFigureDb,
          rxAttenuationDb: parseOptNum(get('Tłum_ant_odb_Rx [dB]'), 1) ?? hw?.rxAttenuationDb,
          permitType: parseOptStr(get('Rodz_dec')),
          issueDate: excelSerialToDateStr(get('Data_wydania')),
          expiryDate: excelSerialToDateStr(get('Data_ważn_pozw/dec')),
          snapshotDate,
        });
        totalChannels++;
      }
      buffer = buffer.slice(startIdx);
    }

    // 3. Write aggregated radiolines to SQLite
    console.log(`[Radiolines Sync] Zapisywanie ${linksMap.size} unikalnych przęseł radioliniowych (${totalChannels} kanałów) do bazy...`);

    ensureKmzSchemaAndColumns(db);
    const existingRows = db.prepare('SELECT id FROM radiolines').all() as Array<{ id: string }>;
    const existingIds = new Set(existingRows.map(r => r.id));
    const snapshotYm = snapshotDate ? snapshotDate.slice(3, 10) : '';

    db.exec('BEGIN');
    try {
      db.exec('DELETE FROM radiolines');
      const insertStmt = db.prepare(`
        INSERT INTO radiolines (
          id, latA, lngA, latB, lngB, frequency, operator, stationA, stationB,
          operatorRaw, permitId, distanceKm, mode, capacityText, channelsJson, province, isNew
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const link of linksMap.values()) {
        // Sort channels: A → B before B → A, then H before V, then by frequency
        link.channels.sort((a, b) => {
          if (a.dir !== b.dir) return a.dir === 'A → B' ? -1 : 1;
          if (a.freqGHz !== b.freqGHz) return b.freqGHz - a.freqGHz;
          return a.pol.localeCompare(b.pol);
        });

        const abChannels = link.channels.filter(ch => ch.dir === 'A → B');
        const baChannels = link.channels.filter(ch => ch.dir === 'B → A');
        const refChannels = abChannels.length >= baChannels.length ? abChannels : baChannels;

        // Detect XPIC (both H and V present in same direction)
        const hasH = refChannels.some(ch => ch.pol === 'H');
        const hasV = refChannels.some(ch => ch.pol === 'V');
        const mode =
          hasH && hasV
            ? 'XPIC'
            : refChannels.length > 1
            ? `${refChannels.length}+0`
            : '1+0';

        // Calculate link capacity (sum of one-way directional channels)
        const sumAb = abChannels.reduce((acc, ch) => acc + ch.mbps, 0);
        const sumBa = baChannels.reduce((acc, ch) => acc + ch.mbps, 0);
        const maxOneWayMbps = Math.max(sumAb, sumBa, link.channels[0]?.mbps || 100);
        const capacityText =
          maxOneWayMbps >= 1000
            ? `${(maxOneWayMbps / 1000).toFixed(2)} Gbps`
            : `${Math.round(maxOneWayMbps)} Mbps`;

        const distanceKm = haversineKm(link.latA, link.lngA, link.latB, link.lngB);
        const primaryFreqGHz = link.channels[0]?.freqGHz || 18.0;
        const id = 'RL_' + createHash('sha256').update(link.key).digest('hex').slice(0, 18);
        const province = normalizeProvinceName(link.channels[0]?.txProvince);
        const issueYm = link.channels[0]?.issueDate ? link.channels[0].issueDate.slice(3, 10) : '';
        const isNew =
          (existingIds.size > 0 && !existingIds.has(id)) || (snapshotYm && issueYm === snapshotYm)
            ? 1
            : 0;

        insertStmt.run(
          id,
          link.latA,
          link.lngA,
          link.latB,
          link.lngB,
          primaryFreqGHz,
          link.operator,
          link.stationA,
          link.stationB,
          link.operatorRaw,
          link.permitId,
          distanceKm,
          mode,
          capacityText,
          JSON.stringify(link.channels),
          province,
          isNew
        );
      }

      db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('radiolinesUpdatedAt', ?)").run(
        new Date().toISOString()
      );
      db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('radiolinesCount', ?)").run(
        String(linksMap.size)
      );
      if (snapshotDate) {
        db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('radiolinesSnapshotDate', ?)").run(
          snapshotDate
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    console.log('[Radiolines Sync] Generowanie zaktualizowanych archiwów KMZ dla radiolinii...');
    rebuildKmzFiles(db, { type: 'radiolines' });
    console.log(`[Radiolines Sync] Zakończono pomyślnie! Zaimportowano ${linksMap.size} linii radiowych UKE.`);
    return { importedLinks: linksMap.size, totalChannels };
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export function createRadiolineSync(db: DatabaseSync) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  async function checkAndSyncMonthlyRadiolines() {
    if (running) return;
    running = true;
    try {
      const { url } = await resolveLatestUkeZipUrl();
      const lastUrlRow = db
        .prepare("SELECT value FROM metadata WHERE key = 'radiolinesSourceUrl'")
        .get() as { value?: string } | undefined;
      const countRow = db.prepare('SELECT COUNT(*) as cnt FROM radiolines').get() as { cnt: number };

      if (countRow.cnt === 0 || (url && lastUrlRow?.value && lastUrlRow.value !== url)) {
        console.log(`[Radiolines AutoSync] Wykryto nowy miesięczny wykaz radiolinii UKE (${url}) — synchronizacja i generowanie plików KMZ...`);
        await syncRadiolinesFromUke(db);
        db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('radiolinesSourceUrl', ?)").run(url);
      } else if (!lastUrlRow?.value && url) {
        db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('radiolinesSourceUrl', ?)").run(url);
      }
    } catch (err) {
      console.warn('[Radiolines AutoSync] Błąd sprawdzania miesięcznego wykazu radiolinii UKE:', (err as Error).message);
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (timer) return;
      console.log('[Radiolines Sync] Usługa automatycznego miesięcznego sprawdzania radiolinii UKE i generowania KMZ została uruchomiona.');
      void checkAndSyncMonthlyRadiolines();
      timer = setInterval(() => {
        void checkAndSyncMonthlyRadiolines();
      }, TWELVE_HOURS_MS);
    },
    async stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
