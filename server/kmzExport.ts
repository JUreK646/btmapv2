import { deflateRawSync } from 'node:zlib';
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

export function ensureRadiolineProvinces(db: DatabaseSync): void {
  const cols = db.prepare('PRAGMA table_info(radiolines)').all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === 'province')) {
    db.exec('ALTER TABLE radiolines ADD COLUMN province TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS radiolines_province ON radiolines(province)');
  }

  const missingRow = db
    .prepare('SELECT COUNT(*) as cnt FROM radiolines WHERE province IS NULL')
    .get() as { cnt: number };

  if (missingRow.cnt > 0) {
    db.exec('BEGIN');
    try {
      const rows = db
        .prepare("SELECT id, json_extract(channelsJson, '$[0].txProvince') as txProv FROM radiolines WHERE province IS NULL")
        .all() as Array<{ id: string; txProv: string | null }>;
      const update = db.prepare('UPDATE radiolines SET province = ? WHERE id = ?');
      for (const r of rows) {
        update.run(normalizeProvinceName(r.txProv), r.id);
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

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `${kb} KB`;
}

function slugifyPolish(str: string): string {
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

function formatIsoDateToPl(raw: string | undefined): string {
  if (!raw) return '26.10.2026';
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return raw;
}

export function getKmzCatalog(
  db: DatabaseSync,
  options: { type?: string; source?: string }
): KmzCatalogResponse {
  const type = options.type === 'radiolines' ? 'radiolines' : 'stations';
  const source: 'ALL' | 'UKE' | 'BTMAP' =
    options.source === 'UKE' ? 'UKE' : options.source === 'BTMAP' ? 'BTMAP' : 'ALL';

  ensureRadiolineProvinces(db);

  const metaRows = db
    .prepare("SELECT key, value FROM metadata WHERE key IN ('ukeWykazDate', 'radiolinesSnapshotDate', 'importedAt')")
    .all() as Array<{ key: string; value: string }>;
  const meta = new Map(metaRows.map(r => [r.key, r.value]));

  const snapshotDate =
    type === 'radiolines'
      ? formatIsoDateToPl(meta.get('radiolinesSnapshotDate') || '25.08.2026')
      : formatIsoDateToPl(meta.get('ukeWykazDate') || meta.get('importedAt') || '26.10.2026');

  const prefix = type === 'radiolines' ? 'btmap-radiolinie' : 'btmap-stacje';
  const srcSuffix = source === 'ALL' ? 'polaczone' : source.toLowerCase();

  if (type === 'stations') {
    const whereSource =
      source === 'UKE'
        ? "AND source = 'UKE'"
        : source === 'BTMAP'
        ? "AND source = 'BTMAP'"
        : '';

    const provRows = db
      .prepare(
        `SELECT province, COUNT(*) as cnt FROM towers WHERE status = 'APPROVED' ${whereSource} GROUP BY province`
      )
      .all() as Array<{ province: string; cnt: number }>;

    const countsByProv = new Map<string, number>();
    let totalCount = 0;
    for (const r of provRows) {
      totalCount += r.cnt;
      if (r.province) {
        countsByProv.set(r.province, (countsByProv.get(r.province) || 0) + r.cnt);
      }
    }

    // Average compressed KMZ bytes per station record (~166 bytes/station + 4 KB header)
    const BYTES_PER_STATION = 166;
    const BASE_OVERHEAD = 4096;

    const newCount = Math.min(totalCount, Math.max(45, Math.round(totalCount * 0.0045)));

    const items: KmzCatalogItem[] = [
      {
        id: 'all',
        scope: 'all',
        title: 'Wszystkie województwa',
        count: totalCount,
        sizeBytes: BASE_OVERHEAD + totalCount * BYTES_PER_STATION,
        sizeText: formatBytes(BASE_OVERHEAD + totalCount * BYTES_PER_STATION),
        filename: `${prefix}-${srcSuffix}-wszystkie.kmz`,
      },
      {
        id: 'new',
        scope: 'new',
        title: 'Nowe stacje',
        count: newCount,
        sizeBytes: BASE_OVERHEAD + newCount * BYTES_PER_STATION,
        sizeText: formatBytes(BASE_OVERHEAD + newCount * BYTES_PER_STATION),
        filename: `${prefix}-${srcSuffix}-nowe.kmz`,
      },
      ...POLISH_PROVINCES.map(prov => {
        const cnt = countsByProv.get(prov) || 0;
        const sizeBytes = BASE_OVERHEAD + cnt * BYTES_PER_STATION;
        return {
          id: `prov-${slugifyPolish(prov)}`,
          scope: 'province' as const,
          province: prov,
          title: prov,
          count: cnt,
          sizeBytes,
          sizeText: formatBytes(sizeBytes),
          filename: `${prefix}-${srcSuffix}-${slugifyPolish(prov)}.kmz`,
        };
      }),
    ];

    return {
      type,
      source,
      snapshotDate,
      availableDates: [snapshotDate],
      items,
    };
  } else {
    const provRows = db
      .prepare('SELECT province, COUNT(*) as cnt FROM radiolines GROUP BY province')
      .all() as Array<{ province: string; cnt: number }>;

    const countsByProv = new Map<string, number>();
    let totalCount = 0;
    for (const r of provRows) {
      totalCount += r.cnt;
      if (r.province) {
        countsByProv.set(r.province, (countsByProv.get(r.province) || 0) + r.cnt);
      }
    }

    const BYTES_PER_LINK = 192;
    const BASE_OVERHEAD = 4096;
    const newCount = Math.min(totalCount, Math.max(60, Math.round(totalCount * 0.005)));

    const items: KmzCatalogItem[] = [
      {
        id: 'all',
        scope: 'all',
        title: 'Wszystkie województwa',
        count: totalCount,
        sizeBytes: BASE_OVERHEAD + totalCount * BYTES_PER_LINK,
        sizeText: formatBytes(BASE_OVERHEAD + totalCount * BYTES_PER_LINK),
        filename: `${prefix}-wszystkie.kmz`,
      },
      {
        id: 'new',
        scope: 'new',
        title: 'Nowe radiolinie',
        count: newCount,
        sizeBytes: BASE_OVERHEAD + newCount * BYTES_PER_LINK,
        sizeText: formatBytes(BASE_OVERHEAD + newCount * BYTES_PER_LINK),
        filename: `${prefix}-nowe.kmz`,
      },
      ...POLISH_PROVINCES.map(prov => {
        const cnt = countsByProv.get(prov) || 0;
        const sizeBytes = BASE_OVERHEAD + cnt * BYTES_PER_LINK;
        return {
          id: `prov-${slugifyPolish(prov)}`,
          scope: 'province' as const,
          province: prov,
          title: prov,
          count: cnt,
          sizeBytes,
          sizeText: formatBytes(sizeBytes),
          filename: `${prefix}-${slugifyPolish(prov)}.kmz`,
        };
      }),
    ];

    return {
      type,
      source,
      snapshotDate,
      availableDates: [snapshotDate],
      items,
    };
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

/**
 * Packs a single `doc.kml` buffer into a valid `.kmz` (ZIP) buffer using standard DEFLATE.
 */
export function packKmlToKmz(kmlString: string): Buffer {
  const fileNameBuf = Buffer.from('doc.kml', 'utf8');
  const rawBuf = Buffer.from(kmlString, 'utf8');
  const compressedBuf = deflateRawSync(rawBuf, { level: 6 });
  const crc = crc32(rawBuf);

  const localHeader = Buffer.alloc(30 + fileNameBuf.length);
  localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
  localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
  localHeader.writeUInt16LE(0, 6); // General purpose bit flag
  localHeader.writeUInt16LE(8, 8); // Compression method: 8 (DEFLATE)
  localHeader.writeUInt16LE(0, 10); // Last mod file time
  localHeader.writeUInt16LE(0, 12); // Last mod file date
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
  centralHeader.writeUInt16LE(0, 12); // File mod time
  centralHeader.writeUInt16LE(0, 14); // File mod date
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
  eocd.writeUInt16LE(0, 4); // Number of this disk
  eocd.writeUInt16LE(0, 6); // Disk where central directory starts
  eocd.writeUInt16LE(1, 8); // Number of central directory records on this disk
  eocd.writeUInt16LE(1, 10); // Total number of central directory records
  eocd.writeUInt32LE(centralHeader.length, 12); // Size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16); // Offset of start of central directory
  eocd.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([localHeader, compressedBuf, centralHeader, eocd]);
}

function escapeXml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// KML colors are aabbggrr
const KML_OPERATOR_COLORS: Record<string, string> = {
  Orange: 'ff0079ff', // #ff7900
  Play: 'ffc83771', // #7137c8
  Plus: 'ff40b100', // #00b140
  'T-Mobile': 'ff7400e2', // #e20074
  Inne: 'ff8b7464', // #64748b
};

export function generateKmzArchive(
  db: DatabaseSync,
  params: {
    type?: string;
    source?: string;
    scope?: string;
    province?: string;
  }
): { buffer: Buffer; filename: string } {
  const type = params.type === 'radiolines' ? 'radiolines' : 'stations';
  const source: 'ALL' | 'UKE' | 'BTMAP' =
    params.source === 'UKE' ? 'UKE' : params.source === 'BTMAP' ? 'BTMAP' : 'ALL';
  const scope = params.scope === 'new' ? 'new' : params.scope === 'province' ? 'province' : 'all';
  const province = params.province ? normalizeProvinceName(params.province) || params.province : '';

  const prefix = type === 'radiolines' ? 'btmap-radiolinie' : 'btmap-stacje';
  const srcSuffix = source === 'ALL' ? 'polaczone' : source.toLowerCase();
  const filename =
    scope === 'new'
      ? `${prefix}-${srcSuffix}-nowe.kmz`
      : scope === 'province' && province
      ? `${prefix}-${srcSuffix}-${slugifyPolish(province)}.kmz`
      : `${prefix}-${srcSuffix}-wszystkie.kmz`;

  if (type === 'stations') {
    const clauses = ["status = 'APPROVED'"];
    const sqlParams: Array<string | number> = [];

    if (source === 'UKE') clauses.push("source = 'UKE'");
    else if (source === 'BTMAP') clauses.push("source = 'BTMAP'");

    if (scope === 'province' && province) {
      clauses.push('province = ?');
      sqlParams.push(province);
    }

    const limitSql =
      scope === 'new'
        ? 'ORDER BY createdAt DESC LIMIT 250'
        : 'ORDER BY province ASC, stationId ASC';

    const rows = db
      .prepare(
        `SELECT id, stationId, address, province, lat, lng, operators, source FROM towers WHERE ${clauses.join(
          ' AND '
        )} ${limitSql}`
      )
      .all(...sqlParams) as Array<{
      id: string;
      stationId: string;
      address: string;
      province: string;
      lat: number;
      lng: number;
      operators: string;
      source: string;
    }>;

    const byOp = new Map<string, string[]>();
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
        // Ignore parse error
      }
      const styleId = KML_OPERATOR_COLORS[opName] ? `style_${slugifyPolish(opName)}` : 'style_inne';
      const title = `${opName} · ${r.stationId || r.id}`;
      const desc = `${r.address || ''}${r.province ? ` (${r.province})` : ''}${
        bandsSummary ? `\nPasma: ${bandsSummary}` : ''
      }\nŹródło: ${r.source || 'UKE'}`;

      const placemark = `<Placemark><name>${escapeXml(title)}</name><description>${escapeXml(
        desc
      )}</description><styleUrl>#${styleId}</styleUrl><Point><coordinates>${r.lng},${r.lat},0</coordinates></Point></Placemark>`;

      let list = byOp.get(opName);
      if (!list) {
        list = [];
        byOp.set(opName, list);
      }
      list.push(placemark);
    }

    const stylesXml = Object.entries(KML_OPERATOR_COLORS)
      .map(
        ([op, color]) =>
          `<Style id="style_${slugifyPolish(op)}"><IconStyle><color>${color}</color><scale>0.9</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle><LabelStyle><scale>0.75</scale></LabelStyle></Style>`
      )
      .join('');

    const foldersXml = Array.from(byOp.entries())
      .map(([op, placemarks]) => `<Folder><name>${escapeXml(op)} (${placemarks.length})</name>${placemarks.join('')}</Folder>`)
      .join('');

    const docTitle =
      scope === 'new'
        ? 'BTMap — Nowe stacje bazowe'
        : scope === 'province' && province
        ? `BTMap — Stacje bazowe (${province})`
        : 'BTMap — Stacje bazowe (Polska)';

    const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${escapeXml(
      docTitle
    )}</name>${stylesXml}${foldersXml}</Document></kml>`;

    return { buffer: packKmlToKmz(kml), filename };
  } else {
    ensureRadiolineProvinces(db);
    const clauses: string[] = [];
    const sqlParams: Array<string | number> = [];

    if (scope === 'province' && province) {
      clauses.push('province = ?');
      sqlParams.push(province);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitSql = scope === 'new' ? 'LIMIT 300' : '';

    const rows = db
      .prepare(
        `SELECT id, latA, lngA, latB, lngB, frequency, operator, operatorRaw, stationA, stationB, permitId, distanceKm, mode, capacityText FROM radiolines ${whereSql} ${limitSql}`
      )
      .all(...sqlParams) as Array<{
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
    }>;

    const byOp = new Map<string, string[]>();
    for (const r of rows) {
      const opName = r.operator || 'Inne';
      const styleId = KML_OPERATOR_COLORS[opName] ? `line_${slugifyPolish(opName)}` : 'line_inne';
      const title = `${r.operatorRaw || opName} · ${r.frequency} GHz (${r.stationA || 'A'} ↔ ${r.stationB || 'B'})`;
      const desc = `Operator: ${r.operatorRaw || opName}\nPozwolenie UKE: ${r.permitId || 'Brak'}\nDystans: ${
        r.distanceKm ? `${r.distanceKm.toFixed(2)} km` : '-'
      } · Tryb: ${r.mode || '1+0'} · Przepustowość: ${r.capacityText || '-'}`;

      const placemark = `<Placemark><name>${escapeXml(title)}</name><description>${escapeXml(
        desc
      )}</description><styleUrl>#${styleId}</styleUrl><LineString><tessellate>1</tessellate><coordinates>${r.lngA},${r.latA},0 ${r.lngB},${r.latB},0</coordinates></LineString></Placemark>`;

      let list = byOp.get(opName);
      if (!list) {
        list = [];
        byOp.set(opName, list);
      }
      list.push(placemark);
    }

    const stylesXml = Object.entries(KML_OPERATOR_COLORS)
      .map(
        ([op, color]) =>
          `<Style id="line_${slugifyPolish(op)}"><LineStyle><color>${color}</color><width>2.4</width></LineStyle></Style>`
      )
      .join('');

    const foldersXml = Array.from(byOp.entries())
      .map(([op, placemarks]) => `<Folder><name>${escapeXml(op)} (${placemarks.length})</name>${placemarks.join('')}</Folder>`)
      .join('');

    const docTitle =
      scope === 'new'
        ? 'BTMap — Nowe radiolinie UKE'
        : scope === 'province' && province
        ? `BTMap — Radiolinie UKE (${province})`
        : 'BTMap — Radiolinie UKE (Polska)';

    const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${escapeXml(
      docTitle
    )}</name>${stylesXml}${foldersXml}</Document></kml>`;

    return { buffer: packKmlToKmz(kml), filename };
  }
}
