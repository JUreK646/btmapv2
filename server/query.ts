import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { MAP_STATION_LIMIT } from '../shared/mapLimits.ts';
import { withAzimuths } from './azimuths.ts';
import { parseCellSearch, type ParsedCellId } from '../shared/cellSearch.ts';
import { isNewBand, newEntryWindow, type NewEntryWindow } from '../shared/newEntries.ts';

const majorOperators = ['Orange', 'T-Mobile', 'Play', 'Plus', 'PKP PLK'];

/** The "new" window anchored to the latest UKE registry this database has synced. */
export function getNewEntryWindow(db: DatabaseSync): NewEntryWindow {
  const row = db.prepare("SELECT value FROM metadata WHERE key='ukeWykazDate'").get() as { value?: string } | undefined;
  return newEntryWindow(row?.value);
}

// SQL twin of isNewTower() below - keep the two in sync (tests/new-entries.test.ts compares them).
const BAND_ENTRY_DATE_SQL = `COALESCE(
  json_extract(nb.value, '$.entryDate'),
  CASE WHEN instr(json_extract(nb.value, '$.permit'), 'wpis ') > 0
    THEN substr(json_extract(nb.value, '$.permit'), instr(json_extract(nb.value, '$.permit'), 'wpis ') + 5, 10) END
)`;

function isNewTower(t: Record<string, unknown>, operators: unknown, window: NewEntryWindow) {
  if (t.createdAt && String(t.createdAt).slice(0, 10) >= window.since) return true;
  if (!Array.isArray(operators)) return false;
  return operators.some(op => Array.isArray(op?.bands) && op.bands.some((b: Record<string, unknown>) => b && isNewBand(b, window, { newPermitsOnly: true })));
}

export function towerWhere(query: Record<string, unknown>, window: NewEntryWindow = newEntryWindow()) {
  const clauses = ["t.status = 'APPROVED'", 't.lat BETWEEN -90 AND 90', 't.lng BETWEEN -180 AND 180'];
  const params: SQLInputValue[] = [];
  const list = (value: unknown) => typeof value === 'string' ? value.split(',').filter(Boolean).slice(0, 20) : [];

  if (query.source && query.source !== 'ALL') {
    if (query.source === 'UKE') {
      clauses.push("(t.source = 'UKE' OR t.addedBy = 'Import KML' OR t.operators LIKE '%/26%')");
    } else if (query.source === 'BTMAP') {
      clauses.push("(t.source = 'BTMAP' OR t.source = 'User')");
    } else {
      clauses.push('t.source = ?');
      params.push(String(query.source));
    }
  }
  if (query.onlyNew === '1' || query.onlyNew === 'true') {
    clauses.push(`(
      substr(t.createdAt, 1, 10) >= ?
      OR EXISTS (
        SELECT 1 FROM json_each(CASE WHEN json_valid(t.operators) THEN t.operators ELSE '[]' END) nop, json_each(nop.value, '$.bands') nb
        WHERE (${BAND_ENTRY_DATE_SQL} >= ? AND ${BAND_ENTRY_DATE_SQL} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
          OR json_extract(nb.value, '$.permit') GLOB '*/' || ? || ' [[]P]*'
      )
    )`);
    params.push(window.since, window.since, window.year);
  }
  if (query.province) { clauses.push('fold(t.province) = fold(?)'); params.push(String(query.province)); }

  let cellSearch: ParsedCellId | null = null;

  if (query.q) {
    const rawQ = String(query.q).slice(0, 150);
    cellSearch = parseCellSearch(rawQ);

    if (cellSearch?.nodeIdStr) {
      const enb = cellSearch.nodeIdStr;
      const btEnb = 'BT' + enb;
      const wildSuffix = '%' + enb;
      const wildPrefix = enb + '%';
      const wildBoth = '%' + enb + '%';
      const cleanAddress = `%${rawQ.replace(/[!%_]/g, '!$&')}%`;

      clauses.push(`(
        fold(t.stationId) = fold(?) OR
        fold(t.stationId) = fold(?) OR
        fold(t.stationId) LIKE fold(?) OR
        fold(t.stationId) LIKE fold(?) OR
        fold(t.operators) LIKE fold(?) OR
        fold(t.id) LIKE fold(?) OR
        fold(t.address) LIKE fold(?) ESCAPE '!'
      )`);
      params.push(enb, btEnb, wildSuffix, wildPrefix, wildBoth, wildBoth, cleanAddress);
    } else {
      clauses.push("(fold(t.address) LIKE fold(?) ESCAPE '!' OR fold(t.stationId) LIKE fold(?) ESCAPE '!' OR fold(t.id) LIKE fold(?) ESCAPE '!' OR fold(t.operators) LIKE fold(?) ESCAPE '!')");
      const text = `%${rawQ.replace(/[!%_]/g, '!$&')}%`;
      params.push(text, text, text, text);
    }
  }

  const bounds = ['minLat','maxLat','minLng','maxLng'].map(key => query[key]);
  if (bounds.some(v => v !== undefined)) {
    if (bounds.some(v => v === undefined || v === '' || !Number.isFinite(Number(v)))) throw new Error('Nieprawidłowy obszar mapy.');
    const [south, north, west, east] = bounds.map(Number);
    if (south > north || west > east || south < -90 || north > 90 || west < -180 || east > 180) throw new Error('Nieprawidłowy obszar mapy.');
    clauses.push('t.lat BETWEEN ? AND ? AND t.lng BETWEEN ? AND ?'); params.push(south,north,west,east);
  }

  const operators = list(query.operators), techs = list(query.techs || query.tech), bands = list(query.bands);
  const modes5g = (query.modes5g || query.mode5g) ? list(query.modes5g || query.mode5g) : [];

  if (operators.length || techs.length || bands.length || modes5g.length) {
    const opClauses: string[] = [];
    if (operators.length) {
      const known = operators.filter(x => x !== 'Inne');
      const choices: string[] = [];
      if (known.length) { choices.push(`json_extract(op.value, '$.name') IN (${known.map(() => '?').join(',')})`); params.push(...known); }
      if (operators.includes('Inne')) { choices.push(`json_extract(op.value, '$.name') NOT IN (${majorOperators.map(() => '?').join(',')})`); params.push(...majorOperators); }
      opClauses.push(`(${choices.join(' OR ')})`);
    }
    const bandClauses: string[] = [];
    if (techs.length) {
      bandClauses.push(`CASE json_extract(b.value, '$.tech') WHEN 'NR' THEN '5G' ELSE json_extract(b.value, '$.tech') END IN (${techs.map(() => '?').join(',')})`);
      params.push(...techs);
    }
    if (bands.length) { bandClauses.push(`REPLACE(json_extract(b.value, '$.band'), 'MHz', '') IN (${bands.map(() => '?').join(',')})`); params.push(...bands); }
    if (bandClauses.length) opClauses.push(`EXISTS (SELECT 1 FROM json_each(op.value, '$.bands') b WHERE ${bandClauses.join(' AND ')})`);

    if (modes5g.length) {
      const hasNsa = modes5g.includes('NSA');
      const hasSa = modes5g.includes('SA');
      if (hasNsa && !hasSa) {
        opClauses.push(`EXISTS (
          SELECT 1 FROM json_each(op.value, '$.bands') b5g
          WHERE CASE json_extract(b5g.value, '$.tech') WHEN 'NR' THEN '5G' ELSE json_extract(b5g.value, '$.tech') END = '5G'
            AND (
              UPPER(COALESCE(json_extract(b5g.value, '$.mode'), 'NSA')) = 'NSA'
              OR t.source = 'UKE'
            )
        )`);
      } else if (hasSa && !hasNsa) {
        opClauses.push(`EXISTS (
          SELECT 1 FROM json_each(op.value, '$.bands') b5g
          WHERE CASE json_extract(b5g.value, '$.tech') WHEN 'NR' THEN '5G' ELSE json_extract(b5g.value, '$.tech') END = '5G'
            AND (
              UPPER(json_extract(b5g.value, '$.mode')) = 'SA'
              OR (
                (t.source = 'UKE' OR t.addedBy = 'Import KML' OR t.operators LIKE '%/26%')
                AND REPLACE(json_extract(b5g.value, '$.band'), 'MHz', '') IN ('3600', '3500', '2600', '2100', '700')
              )
            )
        )`);
      } else if (hasNsa && hasSa) {
        opClauses.push(`EXISTS (
          SELECT 1 FROM json_each(op.value, '$.bands') b5g
          WHERE CASE json_extract(b5g.value, '$.tech') WHEN 'NR' THEN '5G' ELSE json_extract(b5g.value, '$.tech') END = '5G'
        )`);
      }
    }

    clauses.push(`EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(t.operators) THEN t.operators ELSE '[]' END) op WHERE ${opClauses.join(' AND ')})`);
  }
  return { sql: clauses.join(' AND '), params, cellSearch };
}

const bandMhz = (band: unknown) => {
  const m = String(band ?? '').replace(/^[2345]g\b/i, '').match(/\d{3,4}/) || String(band ?? '').match(/\d+/);
  return m ? Number(m[0]) : 0;
};

export function normalizeTower(t: Record<string, unknown>, window: NewEntryWindow = newEntryWindow()): Record<string, unknown> & { source:unknown; operators:unknown[] } {
  let operators: Array<Record<string, unknown>> = [];
  try { operators = JSON.parse(String(t.operators || '[]')); } catch { /* Corrupt legacy rows remain viewable. */ }
  if (Array.isArray(operators)) {
    for (const op of operators) {
      if (op && Array.isArray(op.bands)) {
        op.bands.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
          const fa = bandMhz(a?.band);
          const fb = bandMhz(b?.band);
          if (fa !== fb) return fa - fb;
          return String(a?.tech ?? '').localeCompare(String(b?.tech ?? ''));
        });
        // The details panel marks individual permits; amendments issued this year count there too.
        for (const band of op.bands) if (band && typeof band === 'object' && isNewBand(band, window)) band.isNew = true;
      }
    }
  }
  return { ...t, source: (t.source === 'User' || t.source === 'BTMAP') ? 'BTMAP' : (t.source || 'UKE'), operators, isNew: isNewTower(t, operators, window) };
}

export function withPemCounts<T extends Record<string,unknown>>(db:DatabaseSync,towers:T[]):Array<T&{pemReportsByOperator?:Record<string,{count:number;partial:boolean;checkedAt:string}>}>{
  if(!towers.length)return towers;
  const summaries=db.prepare(`SELECT * FROM pem_report_operator_counts WHERE towerId IN (${towers.map(()=>'?').join(',')})`).all(...towers.map(t=>String(t.id)));
  const byId=new Map<string,Record<string,{count:number;partial:boolean;checkedAt:string}>>();
  for(const row of summaries){
    const id=String(row.towerId),byOperator=byId.get(id)||{};
    byOperator[String(row.operator)]={count:Number(row.count),partial:Boolean(row.partial),checkedAt:String(row.checkedAt)};
    byId.set(id,byOperator);
  }
  return towers.map(tower=>{
    const summaries=byId.get(String(tower.id));
    return summaries?{...tower,pemReportsByOperator:summaries}:tower;
  });
}

export function getTowers(db: DatabaseSync, query: Record<string, unknown>) {
  const window = getNewEntryWindow(db);
  const { sql, params, cellSearch } = towerWhere(query, window);
  const isMinimal = query.minimal === '1';
  const total = isMinimal ? 0 : Number(db.prepare(`SELECT COUNT(*) AS count FROM towers t WHERE ${sql}`).get(...params)!.count);
  const zoom = Number(query.zoom ?? 14);
  if (!Number.isFinite(zoom)) throw new Error('Nieprawidłowe przybliżenie.');
  const isMap = query.view === 'map';
  const isOnlyNew = query.onlyNew === '1' || query.onlyNew === 'true';
  const mapStationLimit = Math.min(MAP_STATION_LIMIT, 1000);
  const limit = Math.min(isMap ? mapStationLimit : 1500, Math.max(1, Number(query.limit) || (isMap ? mapStationLimit : 100)));
  const offset = Math.max(0, Number(query.offset) || 0);

  let orderSql = 't.address, t.id';
  const orderParams: SQLInputValue[] = [];

  if (cellSearch?.nodeIdStr) {
    const enb = cellSearch.nodeIdStr;
    const btEnb = 'BT' + enb;
    const playPattern = '___' + enb;
    const wildSuffix = '%' + enb;
    const wildBoth = '%' + enb + '%';
    orderSql = `CASE
      WHEN fold(t.stationId) = fold(?) THEN 1
      WHEN fold(t.stationId) = fold(?) THEN 2
      WHEN fold(t.stationId) LIKE fold(?) THEN 3
      WHEN fold(t.stationId) LIKE fold(?) THEN 4
      WHEN fold(t.operators) LIKE fold(?) THEN 5
      ELSE 6
    END, t.address, t.id`;
    orderParams.push(enb, btEnb, playPattern, wildSuffix, wildBoth);
  } else if (query.q) {
    const rawQ = String(query.q).slice(0, 150).trim();
    const exactPrefix = `${rawQ}%`;
    const cityPrefix = `${rawQ},%`;
    const streetPrefix = `%${rawQ}%`;
    orderSql = `CASE
      WHEN fold(t.stationId) = fold(?) THEN 1
      WHEN fold(t.stationId) LIKE fold(?) THEN 2
      WHEN fold(t.address) LIKE fold(?) THEN 3
      WHEN fold(t.address) LIKE fold(?) THEN 4
      WHEN fold(t.address) LIKE fold(?) THEN 5
      ELSE 6
    END, t.address, t.id`;
    orderParams.push(rawQ, exactPrefix, cityPrefix, exactPrefix, streetPrefix);
  } else if (isMap) {
    const south = Number(query.minLat);
    const north = Number(query.maxLat);
    const west = Number(query.minLng);
    const east = Number(query.maxLng);
    if (Number.isFinite(south) && Number.isFinite(north) && Number.isFinite(west) && Number.isFinite(east)) {
      const centerLat = (south + north) / 2;
      const centerLng = (west + east) / 2;
      orderSql = `ROW_NUMBER() OVER (
        PARTITION BY json_extract(t.operators, '$[0].name')
        ORDER BY ((t.lat - ?) * (t.lat - ?) + (t.lng - ?) * (t.lng - ?))
      ), t.id`;
      orderParams.push(centerLat, centerLat, centerLng, centerLng);
    } else {
      orderSql = `ROW_NUMBER() OVER (
        PARTITION BY json_extract(t.operators, '$[0].name')
        ORDER BY t.id
      ), t.id`;
    }
  }

  const items = db
    .prepare(`SELECT t.* FROM towers t WHERE ${sql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`)
    .all(...params, ...orderParams, Math.floor(limit), Math.floor(offset))
    .map(row => normalizeTower(row, window));

  const cappedTotal = isMap ? Math.min(total, mapStationLimit) : total;

  if (isMinimal) {
    return { items, total: isMap ? Math.min(items.length, mapStationLimit) : items.length, limit, hasMore: false };
  }
  return { items: withAzimuths(db, withPemCounts(db, items)), total: cappedTotal, limit, hasMore: offset + items.length < cappedTotal };
}
