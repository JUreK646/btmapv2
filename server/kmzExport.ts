import { deflateRawSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

export const POLISH_PROVINCES = [
  'Dolnośląskie',
  'Kujawsko-pomorskie',
  'Lubelskie',
  'Lubuskie',
  'Łódzkie',
  'Małopolskie',
  'Mazowieckie',
  'Opolskie',
  'Podkarpackie',
  'Podlaskie',
  'Pomorskie',
  'Śląskie',
  'Świętokrzyskie',
  'Warmińsko-mazurskie',
  'Wielkopolskie',
  'Zachodniopomorskie',
] as const;

const PROVINCE_LOOKUP = new Map<string, string>(
  POLISH_PROVINCES.map(p => [p.toLowerCase(), p])
);

export function normalizeProvinceName(raw: unknown): string {
  const s = String(raw || '').trim().toLowerCase();
  return PROVINCE_LOOKUP.get(s) || '';
}

export function slugifyPolish(str: string): string {
  return str
    .toLowerCase()
    .replace(/ą/g, 'a')
    .replace(/ć/g, 'c')
    .replace(/ę/g, 'e')
    .replace(/ł/g, 'l')
    .replace(/ń/g, 'n')
    .replace(/ó/g, 'o')
    .replace(/ś/g, 's')
    .replace(/ź|ż/g, 'z')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `${kb} KB`;
}

function formatDatePl(date = new Date()): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

export function ensureKmzSchemaAndColumns(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kmz_files (
      key TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      scope TEXT NOT NULL,
      province TEXT,
      title TEXT NOT NULL,
      count INTEGER NOT NULL,
      sizeBytes INTEGER NOT NULL,
      filename TEXT NOT NULL,
      generatedDate TEXT NOT NULL,
      generatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS kmz_files_lookup ON kmz_files(type, source, generatedDate);
  `);

  const cols = db.prepare('PRAGMA table_info(radiolines)').all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === 'province')) {
    db.exec('ALTER TABLE radiolines ADD COLUMN province TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS radiolines_province ON radiolines(province)');
  }
  if (!cols.some(c => c.name === 'isNew')) {
    db.exec('ALTER TABLE radiolines ADD COLUMN isNew INTEGER DEFAULT 0');
    db.exec('CREATE INDEX IF NOT EXISTS radiolines_isNew ON radiolines(isNew)');
  }

  const missingProv = db
    .prepare('SELECT COUNT(*) as cnt FROM radiolines WHERE province IS NULL')
    .get() as { cnt: number };
  const newCount = db
    .prepare('SELECT COUNT(*) as cnt FROM radiolines WHERE isNew = 1')
    .get() as { cnt: number };

  if (missingProv.cnt > 0 || newCount.cnt === 0) {
    const jsonPathProv = '$[0].txProvince';
    const jsonPathIssue = '$[0].issueDate';

    // Determine latest issue month/year in radiolines (e.g. "08.2026")
    const latestYmRow = db
      .prepare(
        `SELECT substr(json_extract(channelsJson, ?), 4, 7) as ym
         FROM radiolines
         WHERE json_extract(channelsJson, ?) IS NOT NULL
         GROUP BY ym
         ORDER BY substr(ym, 4, 4) DESC, substr(ym, 1, 2) DESC
         LIMIT 1`
      )
      .get(jsonPathIssue, jsonPathIssue) as { ym?: string } | undefined;
    const latestYm = latestYmRow?.ym || '';

    db.exec('BEGIN');
    try {
      const rows = db
        .prepare(
          `SELECT id,
                  json_extract(channelsJson, ?) as txProv,
                  substr(json_extract(channelsJson, ?), 4, 7) as ym,
                  isNew
           FROM radiolines`
        )
        .all(jsonPathProv, jsonPathIssue) as Array<{
        id: string;
        txProv: string | null;
        ym: string | null;
        isNew: number | null;
      }>;

      const update = db.prepare('UPDATE radiolines SET province = ?, isNew = ? WHERE id = ?');
      for (const r of rows) {
        const prov = normalizeProvinceName(r.txProv);
        const flagNew = r.isNew === 1 || (latestYm && r.ym === latestYm) ? 1 : 0;
        update.run(prov, flagNew, r.id);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

// CRC32 Lookup Table for standard ZIP creation
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(dt = new Date()): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, dt.getFullYear());
  const month = dt.getMonth() + 1;
  const day = dt.getDate();
  const hours = dt.getHours();
  const minutes = dt.getMinutes();
  const seconds = Math.floor(dt.getSeconds() / 2);

  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosTime, dosDate };
}

/**
 * Packs a single `doc.kml` buffer into a valid `.kmz` (ZIP) buffer using standard DEFLATE and real DOS timestamps.
 */
export function packKmlToKmz(kmlString: string, modDate = new Date()): Buffer {
  const fileNameBuf = Buffer.from('doc.kml', 'utf8');
  const rawBuf = Buffer.from(kmlString, 'utf8');
  const compressedBuf = deflateRawSync(rawBuf, { level: 6 });
  const crc = crc32(rawBuf);
  const { dosTime, dosDate } = getDosDateTime(modDate);

  const localHeader = Buffer.alloc(30 + fileNameBuf.length);
  localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
  localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
  localHeader.writeUInt16LE(0, 6); // General purpose bit flag
  localHeader.writeUInt16LE(8, 8); // Compression method: 8 (DEFLATE)
  localHeader.writeUInt16LE(dosTime, 10); // Real last mod file time
  localHeader.writeUInt16LE(dosDate, 12); // Real last mod file date
  localHeader.writeUInt32LE(crc, 14); // CRC-32
  localHeader.writeUInt32LE(compressedBuf.length, 18); // Compressed size
  localHeader.writeUInt32LE(rawBuf.length, 22); // Uncompressed size
  localHeader.writeUInt16LE(fileNameBuf.length, 26); // File name length
  localHeader.writeUInt16LE(0, 28); // Extra field length
  fileNameBuf.copy(localHeader, 30);

  const centralDirOffset = localHeader.length + compressedBuf.length;
  const centralHeader = Buffer.alloc(46 + fileNameBuf.length);
  centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory file header signature
  centralHeader.writeUInt16LE(20, 4); // Version made by
  centralHeader.writeUInt16LE(20, 6); // Version needed to extract
  centralHeader.writeUInt16LE(0, 8); // General purpose bit flag
  centralHeader.writeUInt16LE(8, 10); // Compression method: 8 (DEFLATE)
  centralHeader.writeUInt16LE(dosTime, 12); // Real file mod time
  centralHeader.writeUInt16LE(dosDate, 14); // Real file mod date
  centralHeader.writeUInt32LE(crc, 16); // CRC-32
  centralHeader.writeUInt32LE(compressedBuf.length, 20); // Compressed size
  centralHeader.writeUInt32LE(rawBuf.length, 24); // Uncompressed size
  centralHeader.writeUInt16LE(fileNameBuf.length, 28); // File name length
  centralHeader.writeUInt16LE(0, 30); // Extra field length
  centralHeader.writeUInt16LE(0, 32); // File comment length
  centralHeader.writeUInt16LE(0, 34); // Disk number start
  centralHeader.writeUInt16LE(0, 36); // Internal file attributes
  centralHeader.writeUInt32LE(0, 38); // External file attributes
  centralHeader.writeUInt32LE(0, 42); // Relative offset of local header
  fileNameBuf.copy(centralHeader, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // End of central directory signature
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralHeader.length, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localHeader, compressedBuf, centralHeader, eocd]);
}

function escapeXml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// KML colors in aabbggrr format
const KML_OPERATOR_COLORS: Record<string, string> = {
  Orange: 'ff0079ff', // #ff7900
  Play: 'ffc83771', // #7137c8
  Plus: 'ff40b100', // #00b140
  'T-Mobile': 'ff7400e2', // #e20074
  Inne: 'ff8b7464', // #64748b
};

const STATION_STYLES_XML = Object.entries(KML_OPERATOR_COLORS)
  .map(
    ([op, color]) =>
      `<Style id="style_${slugifyPolish(op)}"><IconStyle><color>${color}</color><scale>0.9</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle><LabelStyle><scale>0.75</scale></LabelStyle></Style>`
  )
  .join('');

const RADIOLINE_STYLES_XML = Object.entries(KML_OPERATOR_COLORS)
  .map(
    ([op, color]) =>
      `<Style id="line_${slugifyPolish(op)}"><LineStyle><color>${color}</color><width>2.4</width></LineStyle></Style>`
  )
  .join('');

interface PreparedPlacemark {
  opName: string;
  province: string;
  source: string;
  isNew: boolean;
  xml: string;
}

function buildKmlDocument(
  docTitle: string,
  stylesXml: string,
  items: PreparedPlacemark[]
): string {
  const byOp = new Map<string, string[]>();
  for (const item of items) {
    let list = byOp.get(item.opName);
    if (!list) {
      list = [];
      byOp.set(item.opName, list);
    }
    list.push(item.xml);
  }
  const foldersXml = Array.from(byOp.entries())
    .map(
      ([op, placemarks]) =>
        `<Folder><name>${escapeXml(op)} (${placemarks.length})</name>${placemarks.join('')}</Folder>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${escapeXml(
    docTitle
  )}</name>${stylesXml}${foldersXml}</Document></kml>`;
}

/**
 * Generates and writes real `.kmz` files on disk (`data/kmz/`) from the actual SQLite database (`towers` & `radiolines`),
 * recording their exact compressed byte sizes and real generation date in `kmz_files`.
 */
export function rebuildKmzFiles(
  db: DatabaseSync,
  options: { type?: 'stations' | 'radiolines' | 'all' } = {}
): void {
  ensureKmzSchemaAndColumns(db);

  const kmzDir = resolve(process.cwd(), 'data', 'kmz');
  mkdirSync(kmzDir, { recursive: true });

  const now = new Date();
  const generatedDate = formatDatePl(now);
  const generatedAt = now.toISOString();
  const targetType = options.type || 'all';

  const upsertFile = db.prepare(`
    INSERT OR REPLACE INTO kmz_files (
      key, type, source, scope, province, title, count, sizeBytes, filename, generatedDate, generatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  if (targetType === 'all' || targetType === 'stations') {
    const latestDateRow = db
      .prepare("SELECT MAX(substr(createdAt, 1, 10)) as maxDt FROM towers WHERE status = 'APPROVED'")
      .get() as { maxDt?: string } | undefined;
    const latestImportDay = latestDateRow?.maxDt || '';

    const rows = db
      .prepare(
        "SELECT id, stationId, address, province, lat, lng, operators, source, createdAt FROM towers WHERE status = 'APPROVED' ORDER BY province ASC, stationId ASC"
      )
      .all() as Array<{
      id: string;
      stationId: string;
      address: string;
      province: string;
      lat: number;
      lng: number;
      operators: string;
      source: string;
      createdAt: string | null;
    }>;

    const prepared: PreparedPlacemark[] = [];
    for (const r of rows) {
      let opName = 'Inne';
      let bandsSummary = '';
      try {
        const ops = JSON.parse(r.operators || '[]') as Array<{
          name?: string;
          bands?: Array<{ tech?: string; band?: string }>;
        }>;
        if (ops[0]?.name) opName = ops[0].name;
        if (ops[0]?.bands?.length) {
          bandsSummary = ops[0].bands.map(b => `${b.tech || ''} ${b.band || ''}`.trim()).join(', ');
        }
      } catch {
        // Ignore invalid JSON
      }
      const styleId = KML_OPERATOR_COLORS[opName] ? `style_${slugifyPolish(opName)}` : 'style_inne';
      const title = `${opName} · ${r.stationId || r.id}`;
      const desc = `${r.address || ''}${r.province ? ` (${r.province})` : ''}${
        bandsSummary ? `\nPasma: ${bandsSummary}` : ''
      }\nŹródło: ${r.source || 'UKE'}`;

      const xml = `<Placemark><name>${escapeXml(title)}</name><description>${escapeXml(
        desc
      )}</description><styleUrl>#${styleId}</styleUrl><Point><coordinates>${r.lng},${r.lat},0</coordinates></Point></Placemark>`;

      const isNew =
        r.source === 'BTMAP' ||
        Boolean(latestImportDay && r.createdAt && r.createdAt.startsWith(latestImportDay));

      prepared.push({
        opName,
        province: r.province || '',
        source: r.source === 'BTMAP' ? 'BTMAP' : 'UKE',
        isNew,
        xml,
      });
    }

    for (const src of ['ALL', 'UKE', 'BTMAP'] as const) {
      const srcItems =
        src === 'ALL' ? prepared : prepared.filter(p => p.source === src);
      const srcSuffix = src === 'ALL' ? 'polaczone' : src.toLowerCase();

      const writeStationEntry = (
        scope: 'all' | 'new' | 'province',
        province: string | null,
        title: string,
        subset: PreparedPlacemark[],
        filename: string
      ) => {
        const docTitle =
          scope === 'new'
            ? `BTMap — Nowe stacje (${src})`
            : scope === 'province' && province
            ? `BTMap — Stacje bazowe (${province} · ${src})`
            : `BTMap — Stacje bazowe (Polska · ${src})`;
        const kml = buildKmlDocument(docTitle, STATION_STYLES_XML, subset);
        const buf = packKmlToKmz(kml, now);
        writeFileSync(resolve(kmzDir, filename), buf);

        const key = `stations:${src}:${scope}:${province || ''}`;
        upsertFile.run(
          key,
          'stations',
          src,
          scope,
          province,
          title,
          subset.length,
          buf.length,
          filename,
          generatedDate,
          generatedAt
        );
      };

      db.exec('BEGIN');
      try {
        writeStationEntry(
          'all',
          null,
          'Wszystkie województwa',
          srcItems,
          `btmap-stacje-${srcSuffix}-wszystkie.kmz`
        );

        const newItems = srcItems.filter(p => p.isNew);
        writeStationEntry(
          'new',
          null,
          'Nowe stacje',
          newItems,
          `btmap-stacje-${srcSuffix}-nowe.kmz`
        );

        const byProv = new Map<string, PreparedPlacemark[]>();
        for (const p of srcItems) {
          if (!p.province) continue;
          let list = byProv.get(p.province);
          if (!list) {
            list = [];
            byProv.set(p.province, list);
          }
          list.push(p);
        }

        for (const prov of POLISH_PROVINCES) {
          const provItems = byProv.get(prov) || [];
          writeStationEntry(
            'province',
            prov,
            prov,
            provItems,
            `btmap-stacje-${srcSuffix}-${slugifyPolish(prov)}.kmz`
          );
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    }
  }

  if (targetType === 'all' || targetType === 'radiolines') {
    const rows = db
      .prepare(
        'SELECT id, latA, lngA, latB, lngB, frequency, operator, operatorRaw, stationA, stationB, permitId, distanceKm, mode, capacityText, province, isNew FROM radiolines'
      )
      .all() as Array<{
      id: string;
      latA: number;
      lngA: number;
      latB: number;
      lngB: number;
      frequency: number;
      operator: string;
      operatorRaw: string;
      stationA: string;
      stationB: string;
      permitId: string;
      distanceKm: number;
      mode: string;
      capacityText: string;
      province: string | null;
      isNew: number | null;
    }>;

    const prepared: PreparedPlacemark[] = [];
    for (const r of rows) {
      const opName = r.operator || 'Inne';
      const styleId = KML_OPERATOR_COLORS[opName] ? `line_${slugifyPolish(opName)}` : 'line_inne';
      const title = `${r.operatorRaw || opName} · ${r.frequency} GHz (${r.stationA || 'A'} ↔ ${
        r.stationB || 'B'
      })`;
      const desc = `Operator: ${r.operatorRaw || opName}\nPozwolenie UKE: ${
        r.permitId || 'Brak'
      }\nDystans: ${r.distanceKm ? `${r.distanceKm.toFixed(2)} km` : '-'} · Tryb: ${
        r.mode || '1+0'
      } · Przepustowość: ${r.capacityText || '-'}`;

      const xml = `<Placemark><name>${escapeXml(title)}</name><description>${escapeXml(
        desc
      )}</description><styleUrl>#${styleId}</styleUrl><LineString><tessellate>1</tessellate><coordinates>${
        r.lngA
      },${r.latA},0 ${r.lngB},${r.latB},0</coordinates></LineString></Placemark>`;

      prepared.push({
        opName,
        province: r.province || '',
        source: 'UKE',
        isNew: r.isNew === 1,
        xml,
      });
    }

    const writeRadiolineEntry = (
      scope: 'all' | 'new' | 'province',
      province: string | null,
      title: string,
      subset: PreparedPlacemark[],
      filename: string
    ) => {
      const docTitle =
        scope === 'new'
          ? 'BTMap — Nowe radiolinie UKE'
          : scope === 'province' && province
          ? `BTMap — Radiolinie UKE (${province})`
          : 'BTMap — Radiolinie UKE (Polska)';
      const kml = buildKmlDocument(docTitle, RADIOLINE_STYLES_XML, subset);
      const buf = packKmlToKmz(kml, now);
      writeFileSync(resolve(kmzDir, filename), buf);

      const key = `radiolines:UKE:${scope}:${province || ''}`;
      upsertFile.run(
        key,
        'radiolines',
        'UKE',
        scope,
        province,
        title,
        subset.length,
        buf.length,
        filename,
        generatedDate,
        generatedAt
      );
    };

    db.exec('BEGIN');
    try {
      writeRadiolineEntry(
        'all',
        null,
        'Wszystkie województwa',
        prepared,
        'btmap-radiolinie-wszystkie.kmz'
      );

      const newLinks = prepared.filter(p => p.isNew);
      writeRadiolineEntry('new', null, 'Nowe radiolinie', newLinks, 'btmap-radiolinie-nowe.kmz');

      const byProv = new Map<string, PreparedPlacemark[]>();
      for (const p of prepared) {
        if (!p.province) continue;
        let list = byProv.get(p.province);
        if (!list) {
          list = [];
          byProv.set(p.province, list);
        }
        list.push(p);
      }

      for (const prov of POLISH_PROVINCES) {
        const provItems = byProv.get(prov) || [];
        writeRadiolineEntry(
          'province',
          prov,
          prov,
          provItems,
          `btmap-radiolinie-${slugifyPolish(prov)}.kmz`
        );
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

export interface KmzCatalogItem {
  id: string;
  scope: 'all' | 'new' | 'province';
  province?: string;
  title: string;
  count: number;
  sizeBytes: number;
  sizeText: string;
  filename: string;
}

export interface KmzCatalogResponse {
  type: 'stations' | 'radiolines';
  source: 'ALL' | 'UKE' | 'BTMAP';
  snapshotDate: string;
  availableDates: string[];
  items: KmzCatalogItem[];
}

export function getKmzCatalog(
  db: DatabaseSync,
  options: { type?: string; source?: string }
): KmzCatalogResponse {
  ensureKmzSchemaAndColumns(db);

  const type = options.type === 'radiolines' ? 'radiolines' : 'stations';
  const source: 'ALL' | 'UKE' | 'BTMAP' =
    type === 'radiolines'
      ? 'UKE'
      : options.source === 'UKE'
      ? 'UKE'
      : options.source === 'BTMAP'
      ? 'BTMAP'
      : 'ALL';

  let rows = db
    .prepare(
      'SELECT scope, province, title, count, sizeBytes, filename, generatedDate FROM kmz_files WHERE type = ? AND source = ?'
    )
    .all(type, source) as Array<{
    scope: 'all' | 'new' | 'province';
    province: string | null;
    title: string;
    count: number;
    sizeBytes: number;
    filename: string;
    generatedDate: string;
  }>;

  if (rows.length < 18) {
    rebuildKmzFiles(db, { type });
    rows = db
      .prepare(
        'SELECT scope, province, title, count, sizeBytes, filename, generatedDate FROM kmz_files WHERE type = ? AND source = ?'
      )
      .all(type, source) as typeof rows;
  }

  const byKey = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    byKey.set(`${r.scope}:${r.province || ''}`, r);
  }

  const orderedEntries: Array<(typeof rows)[number]> = [];
  const allRow = byKey.get('all:');
  if (allRow) orderedEntries.push(allRow);
  const newRow = byKey.get('new:');
  if (newRow) orderedEntries.push(newRow);
  for (const prov of POLISH_PROVINCES) {
    const pRow = byKey.get(`province:${prov}`);
    if (pRow) orderedEntries.push(pRow);
  }

  const snapshotDate = orderedEntries[0]?.generatedDate || formatDatePl(new Date());

  const items: KmzCatalogItem[] = orderedEntries.map(r => ({
    id: r.scope === 'province' && r.province ? `prov-${slugifyPolish(r.province)}` : r.scope,
    scope: r.scope,
    province: r.province || undefined,
    title: r.title,
    count: r.count,
    sizeBytes: r.sizeBytes,
    sizeText: formatBytes(r.sizeBytes),
    filename: r.filename,
  }));

  return {
    type,
    source,
    snapshotDate,
    availableDates: [snapshotDate],
    items,
  };
}

export function generateKmzArchive(
  db: DatabaseSync,
  params: {
    type?: string;
    source?: string;
    scope?: string;
    province?: string;
  }
): { buffer: Buffer; filename: string } {
  ensureKmzSchemaAndColumns(db);

  const type = params.type === 'radiolines' ? 'radiolines' : 'stations';
  const source: 'ALL' | 'UKE' | 'BTMAP' =
    type === 'radiolines'
      ? 'UKE'
      : params.source === 'UKE'
      ? 'UKE'
      : params.source === 'BTMAP'
      ? 'BTMAP'
      : 'ALL';
  const scope = params.scope === 'new' ? 'new' : params.scope === 'province' ? 'province' : 'all';
  const province =
    scope === 'province' && params.province
      ? normalizeProvinceName(params.province) || params.province
      : '';

  const key = `${type}:${source}:${scope}:${province}`;
  let row = db
    .prepare('SELECT filename FROM kmz_files WHERE key = ?')
    .get(key) as { filename: string } | undefined;

  const kmzDir = resolve(process.cwd(), 'data', 'kmz');
  if (!row || !existsSync(resolve(kmzDir, row.filename))) {
    rebuildKmzFiles(db, { type });
    row = db
      .prepare('SELECT filename FROM kmz_files WHERE key = ?')
      .get(key) as { filename: string } | undefined;
  }

  if (row && existsSync(resolve(kmzDir, row.filename))) {
    return {
      buffer: readFileSync(resolve(kmzDir, row.filename)),
      filename: row.filename,
    };
  }

  throw new Error('Nie znaleziono wygenerowanego pliku KMZ.');
}
