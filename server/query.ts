import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { MAP_STATION_LIMIT } from '../shared/mapLimits.ts';
import { withAzimuths } from './azimuths.ts';

const majorOperators = ['Orange', 'T-Mobile', 'Play', 'Plus'];
export function towerWhere(query: Record<string, unknown>) {
  const clauses = ["t.status = 'APPROVED'", 't.lat BETWEEN -90 AND 90', 't.lng BETWEEN -180 AND 180'];
  const params: SQLInputValue[] = [];
  const list = (value: unknown) => typeof value === 'string' ? value.split(',').filter(Boolean).slice(0, 20) : [];
  if (query.source && query.source !== 'ALL') { clauses.push('t.source = ?'); params.push(String(query.source)); }
  if (query.province) { clauses.push('fold(t.province) = fold(?)'); params.push(String(query.province)); }
  if (query.q) {
    clauses.push("(fold(t.address) LIKE fold(?) ESCAPE '!' OR fold(t.stationId) LIKE fold(?) ESCAPE '!' OR fold(t.id) LIKE fold(?) ESCAPE '!' OR fold(t.operators) LIKE fold(?) ESCAPE '!')");
    const text = `%${String(query.q).slice(0, 150).replace(/[!%_]/g, '!$&')}%`;
    params.push(text, text, text, text);
  }
  const bounds = ['minLat','maxLat','minLng','maxLng'].map(key => query[key]);
  if (bounds.some(v => v !== undefined)) {
    if (bounds.some(v => v === undefined || v === '' || !Number.isFinite(Number(v)))) throw new Error('Nieprawidłowy obszar mapy.');
    const [south, north, west, east] = bounds.map(Number);
    if (south > north || west > east || south < -90 || north > 90 || west < -180 || east > 180) throw new Error('Nieprawidłowy obszar mapy.');
    clauses.push('t.lat BETWEEN ? AND ? AND t.lng BETWEEN ? AND ?'); params.push(south,north,west,east);
  }
  const operators = list(query.operators), techs = list(query.techs || query.tech), bands = list(query.bands);
  if (operators.length || techs.length || bands.length) {
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
    clauses.push(`EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(t.operators) THEN t.operators ELSE '[]' END) op WHERE ${opClauses.join(' AND ')})`);
  }
  return { sql: clauses.join(' AND '), params };
}

const bandMhz = (band: unknown) => {
  const m = String(band ?? '').replace(/^[2345]g\b/i, '').match(/\d{3,4}/) || String(band ?? '').match(/\d+/);
  return m ? Number(m[0]) : 0;
};

export function normalizeTower(t: Record<string, unknown>): Record<string, unknown> & { source:unknown; operators:unknown[] } {
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
      }
    }
  }
  return { ...t, source: (t.source === 'User' || t.source === 'BTMAP') ? 'BTMAP' : (t.source || 'UKE'), operators };
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
  const { sql, params } = towerWhere(query);
  const isMinimal = query.minimal === '1';
  const total = isMinimal ? 0 : Number(db.prepare(`SELECT COUNT(*) AS count FROM towers t WHERE ${sql}`).get(...params)!.count);
  const zoom = Number(query.zoom ?? 14);
  if (!Number.isFinite(zoom)) throw new Error('Nieprawidłowe przybliżenie.');
  const isMap = query.view === 'map';
  const limit = Math.min(isMap ? MAP_STATION_LIMIT : 1500, Math.max(1, Number(query.limit) || (isMap ? MAP_STATION_LIMIT : 100)));
  const offset = Math.max(0, Number(query.offset) || 0);
  const items = db.prepare(`SELECT t.* FROM towers t WHERE ${sql} ORDER BY t.address, t.id LIMIT ? OFFSET ?`).all(...params,Math.floor(limit),Math.floor(offset)).map(normalizeTower);
  if (isMinimal) {
    return { items, total: items.length, limit, hasMore: false };
  }
  return { items: withAzimuths(db, withPemCounts(db, items)), total, limit, hasMore: offset + items.length < total };
}
