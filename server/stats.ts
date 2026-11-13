import type { DatabaseSync } from 'node:sqlite';
import { ukeViewSql } from './query.ts';

export interface StatsOperatorItem {
  name: string;
  towers: number;
  permits: number;
  percent: number;
  permitPercent: number;
}

export interface StatsTechItem {
  tech: string;
  towers: number;
  permits: number;
  percent: number;
  permitPercent: number;
}

export interface StatsBandItem {
  key: string;
  tech: string;
  band: string;
  total: number;
  operators: { operator: string; count: number }[];
}

export interface StatsProvinceItem {
  province: string;
  total: number;
  operators: { operator: string; count: number }[];
}

export interface StatsRadiolineOperatorItem {
  name: string;
  group: string;
  links: number;
  percent: number;
  avgDistanceKm: number;
}

export interface StatsRadiolineBandItem {
  band: string;
  rangeLabel: string;
  total: number;
  percent: number;
  avgDistanceKm: number;
  operators: { operator: string; count: number }[];
}

export interface StatsRadiolineProvinceItem {
  province: string;
  total: number;
  operators: { operator: string; count: number }[];
}

export interface StatsGrowthOperatorBar {
  operator: string;
  total: number;
  newCount: number;
  newPercent: number;
}

export interface StatsGrowthMetricCard {
  key: string;
  label: string;
  total: number;
  newTotal: number;
  operators: StatsGrowthOperatorBar[];
}

export interface StatsGrowthBandCard {
  key: string;
  tech: string;
  band: string;
  duplex: 'FDD' | 'TDD';
  totalCells: number;
  newCells: number;
  totalStations: number;
  newStations: number;
  operatorCells: StatsGrowthOperatorBar[];
  operatorStations: StatsGrowthOperatorBar[];
}

export interface StatsPeriodReport {
  id: string;
  title: string;
  dateRange: string;
  /** Registry date this report is compared with; null when there is no earlier registry yet. */
  comparedTo: string | null;
  source: 'UKE' | 'BTMAP' | 'ALL';
  metrics: {
    stations: StatsGrowthMetricCard;
    cells: StatsGrowthMetricCard;
    cBand: StatsGrowthMetricCard;
    fourBandLte: StatsGrowthMetricCard;
    radiolines: StatsGrowthMetricCard;
    permits: StatsGrowthMetricCard;
  };
  bands: StatsGrowthBandCard[];
}

export interface StatsRadiolinesData {
  totalLinks: number;
  newLinks: number;
  avgDistanceKm: number;
  maxDistanceKm: number;
  totalLengthKm: number;
  updatedAt: string | null;
  operators: StatsRadiolineOperatorItem[];
  bands: StatsRadiolineBandItem[];
  provinces: StatsRadiolineProvinceItem[];
}

export interface StatsTimelineItem {
  period: string;
  label: string;
  totalNew: number;
  operators: { operator: string; count: number }[];
  topBands: { band: string; count: number }[];
}

export interface StatsComparisonBandItem {
  key: string;
  tech: string;
  band: string;
  ukeTotal: number;
  btmapTotal: number;
}

export interface StatsDataQuality {
  totalTowers: number;
  ukeTowers: number;
  btmapTowers: number;
  withExplicitProvince: number;
  inferredProvince: number;
  withFullAddress: number;
  multiBandLteTowers: number;
  fourBandLteTowers: number;
  fiveGCBandTowers: number;
  fiveGDssTowers: number;
  collocatedTowers: number;
  pemPlansCount: number;
  pemCachedTowers: number;
  pemCachedReports: number;
  ukeWykazDate: string | null;
  radiolinesUpdatedAt: string | null;
}

export interface TelecomStats {
  source: 'ALL' | 'BTMAP' | 'UKE';
  summary: {
    totalTowers: number;
    totalPermits: number;
    totalCells: number;
    ukeTowers: number;
    btmapTowers: number;
    latestNewTowers: number;
    latestNewDate: string | null;
  };
  technologies: StatsTechItem[];
  operators: StatsOperatorItem[];
  bands: StatsBandItem[];
  provinces: StatsProvinceItem[];
  timeline: StatsTimelineItem[];
  monthlyReports: StatsPeriodReport[];
  comparison: {
    bands: StatsComparisonBandItem[];
  };
  radiolines: StatsRadiolinesData;
  dataQuality: StatsDataQuality;
  updatedAt: string;
}

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

function inferProvinceFromCoords(lat: number, lng: number): string {
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

function classifyRadiolineBand(freqGhz: number): { band: string; rangeLabel: string; order: number } {
  const f = Math.round(freqGhz);
  if (f <= 9) return { band: '7 / 8 GHz', rangeLabel: '6.4 – 8.5 GHz (daleki zasięg)', order: 1 };
  if (f <= 13) return { band: '11 / 13 GHz', rangeLabel: '10.7 – 13.25 GHz (średni zasięg)', order: 2 };
  if (f <= 16) return { band: '15 GHz', rangeLabel: '14.5 – 15.35 GHz', order: 3 };
  if (f <= 20) return { band: '18 GHz', rangeLabel: '17.7 – 19.7 GHz', order: 4 };
  if (f <= 26) return { band: '23 GHz', rangeLabel: '21.2 – 23.6 GHz', order: 5 };
  if (f <= 34) return { band: '32 GHz', rangeLabel: '31.8 – 33.4 GHz', order: 6 };
  if (f <= 42) return { band: '38 GHz', rangeLabel: '37.0 – 39.5 GHz (krótki zasięg)', order: 7 };
  return { band: '80 GHz (E-Band)', rangeLabel: '71 – 86 GHz (wysoka przepustowość)', order: 8 };
}

const cache = new Map<string, { at: number; data: TelecomStats }>();
let cachedComparisonBands: StatsComparisonBandItem[] | null = null;
let cachedComparisonAt = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function invalidateStatsCache() {
  cache.clear();
}

function computeRadiolinesStats(db: DatabaseSync): StatsRadiolinesData {
  const rows = db.prepare(
    'SELECT operator, operatorRaw, frequency, distanceKm, province, isNew FROM radiolines'
  ).all() as Array<{
    operator: string;
    operatorRaw: string;
    frequency: number;
    distanceKm: number;
    province: string;
    isNew: number;
  }>;

  const metaUpdated = db.prepare("SELECT value FROM metadata WHERE key = 'radiolinesUpdatedAt'").get() as { value?: string } | undefined;

  const totalLinks = rows.length;
  let newLinks = 0;
  let totalLengthKm = 0;
  let maxDistanceKm = 0;

  const opStats = new Map<string, { group: string; count: number; distSum: number }>();
  const bandStats = new Map<string, { rangeLabel: string; order: number; count: number; distSum: number; ops: Map<string, number> }>();
  const provStats = new Map<string, { total: number; ops: Map<string, number> }>();

  for (const r of rows) {
    const dist = Number(r.distanceKm) || 0;
    totalLengthKm += dist;
    if (dist > maxDistanceKm) maxDistanceKm = dist;
    if (r.isNew) newLinks++;

    const opGroup = (r.operator || 'Inne').trim();
    const rawName = (r.operatorRaw || opGroup).trim();
    const displayOp = opGroup !== 'Inne' ? opGroup : rawName;

    const curOp = opStats.get(displayOp) || { group: opGroup, count: 0, distSum: 0 };
    curOp.count++;
    curOp.distSum += dist;
    opStats.set(displayOp, curOp);

    // A link without a recorded frequency is not counted under the lowest band.
    const bInfo = Number(r.frequency) > 0
      ? classifyRadiolineBand(Number(r.frequency))
      : { band: 'Brak danych', rangeLabel: 'częstotliwość nieznana', order: 99 };
    let curBand = bandStats.get(bInfo.band);
    if (!curBand) {
      curBand = { rangeLabel: bInfo.rangeLabel, order: bInfo.order, count: 0, distSum: 0, ops: new Map() };
      bandStats.set(bInfo.band, curBand);
    }
    curBand.count++;
    curBand.distSum += dist;
    curBand.ops.set(opGroup, (curBand.ops.get(opGroup) || 0) + 1);

    const prov = (r.province || '').trim();
    if (prov) {
      let curProv = provStats.get(prov);
      if (!curProv) {
        curProv = { total: 0, ops: new Map() };
        provStats.set(prov, curProv);
      }
      curProv.total++;
      curProv.ops.set(opGroup, (curProv.ops.get(opGroup) || 0) + 1);
    }
  }

  // Group top operators (top 9 + Pozostali operatorzy)
  const sortedOps = Array.from(opStats.entries()).sort((a, b) => b[1].count - a[1].count);
  const topOps = sortedOps.slice(0, 9);
  const restOps = sortedOps.slice(9);

  const operators: StatsRadiolineOperatorItem[] = topOps.map(([name, info]) => ({
    name,
    group: info.group,
    links: info.count,
    percent: totalLinks > 0 ? Number(((info.count / totalLinks) * 100).toFixed(2)) : 0,
    avgDistanceKm: info.count > 0 ? Number((info.distSum / info.count).toFixed(2)) : 0,
  }));

  if (restOps.length > 0) {
    const restCount = restOps.reduce((s, [, v]) => s + v.count, 0);
    const restDist = restOps.reduce((s, [, v]) => s + v.distSum, 0);
    operators.push({
      name: `Pozostali (${restOps.length} podmiotów)`,
      group: 'Inne',
      links: restCount,
      percent: totalLinks > 0 ? Number(((restCount / totalLinks) * 100).toFixed(2)) : 0,
      avgDistanceKm: restCount > 0 ? Number((restDist / restCount).toFixed(2)) : 0,
    });
  }

  const bands: StatsRadiolineBandItem[] = Array.from(bandStats.entries())
    .sort((a, b) => a[1].order - b[1].order)
    .map(([band, info]) => ({
      band,
      rangeLabel: info.rangeLabel,
      total: info.count,
      percent: totalLinks > 0 ? Number(((info.count / totalLinks) * 100).toFixed(1)) : 0,
      avgDistanceKm: info.count > 0 ? Number((info.distSum / info.count).toFixed(2)) : 0,
      operators: Array.from(info.ops.entries())
        .map(([operator, count]) => ({ operator, count }))
        .sort((a, b) => b.count - a.count),
    }));

  const provinces: StatsRadiolineProvinceItem[] = Array.from(provStats.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([province, info]) => ({
      province,
      total: info.total,
      operators: Array.from(info.ops.entries())
        .map(([operator, count]) => ({ operator, count }))
        .sort((a, b) => b.count - a.count),
    }));

  return {
    totalLinks,
    newLinks,
    avgDistanceKm: totalLinks > 0 ? Number((totalLengthKm / totalLinks).toFixed(2)) : 0,
    maxDistanceKm: Number(maxDistanceKm.toFixed(2)),
    totalLengthKm: Math.round(totalLengthKm),
    updatedAt: metaUpdated?.value || null,
    operators,
    bands,
    provinces,
  };
}

const STANDARD_GROWTH_BANDS: Array<{ key: string; tech: string; band: string; duplex: 'FDD' | 'TDD' }> = [
  { key: 'GSM 900', tech: 'GSM', band: '900', duplex: 'FDD' },
  { key: 'GSM 1800', tech: 'GSM', band: '1800', duplex: 'FDD' },
  { key: 'UMTS 900 (FDD)', tech: 'UMTS', band: '900', duplex: 'FDD' },
  { key: 'UMTS 2100 (FDD)', tech: 'UMTS', band: '2100', duplex: 'FDD' },
  { key: 'LTE 700 (FDD)', tech: 'LTE', band: '700', duplex: 'FDD' },
  { key: 'LTE 800 (FDD)', tech: 'LTE', band: '800', duplex: 'FDD' },
  { key: 'LTE 900 (FDD)', tech: 'LTE', band: '900', duplex: 'FDD' },
  { key: 'LTE 1800 (FDD)', tech: 'LTE', band: '1800', duplex: 'FDD' },
  { key: 'LTE 2100 (FDD)', tech: 'LTE', band: '2100', duplex: 'FDD' },
  { key: 'LTE 2600 (FDD)', tech: 'LTE', band: '2600', duplex: 'FDD' },
  { key: 'LTE 2600 (TDD)', tech: 'LTE', band: '2600', duplex: 'TDD' },
  { key: 'NR 700 (FDD)', tech: '5G', band: '700', duplex: 'FDD' },
  { key: 'NR 2100 (FDD)', tech: '5G', band: '2100', duplex: 'FDD' },
  { key: 'NR 2600 (TDD)', tech: '5G', band: '2600', duplex: 'TDD' },
  { key: 'NR 3500 (TDD)', tech: '5G', band: '3500', duplex: 'TDD' },
];

function matchesGrowthBand(b: any, target: { key: string; tech: string; band: string; duplex: 'FDD' | 'TDD' }): boolean {
  let bTech = String(b.tech || '').toUpperCase();
  if (bTech === 'NR') bTech = '5G';
  let tTech = target.tech.toUpperCase();
  if (tTech === 'NR') tTech = '5G';
  if (bTech !== tTech) return false;

  const rawBand = String(b.band || '').replace(/MHz/i, '').trim();
  const tBand = target.band.trim();
  const duplex = String(b.duplex || '').toUpperCase();

  if (tTech === '5G' && (tBand === '3500' || tBand === '3600')) {
    return rawBand === '3500' || rawBand === '3600' || rawBand === 'n78' || rawBand === '78';
  }

  if (tBand === '2600') {
    if (tTech === '5G') {
      return rawBand === '2600' || rawBand === '38' || rawBand === 'n38' || rawBand === '41' || rawBand === 'n41' || rawBand === '7' || rawBand === 'n7';
    }
    if (target.duplex === 'TDD') {
      return (rawBand === '2600' && duplex === 'TDD') || rawBand === '38';
    } else {
      return (rawBand === '2600' && duplex !== 'TDD') || rawBand === '7';
    }
  }

  if (tBand === '700') return rawBand === '700' || rawBand === '28' || rawBand === 'n28';
  if (tBand === '800') return rawBand === '800' || rawBand === '20' || rawBand === 'n20';
  if (tBand === '900') return rawBand === '900' || rawBand === '8' || rawBand === 'n8';
  if (tBand === '1800') return rawBand === '1800' || rawBand === '3' || rawBand === 'n3';
  if (tBand === '2100') return rawBand === '2100' || rawBand === '1' || rawBand === 'n1';

  return rawBand === tBand;
}

type GrowthSource = 'ALL' | 'BTMAP' | 'UKE';

/** Per-operator counters of everything the growth view reports on, for one data source at one moment. */
export interface GrowthCounters {
  totals: { stations: number; cells: number; permits: number; cBand: number; fourCa: number; radiolines: number };
  stations: Record<string, number>;
  cells: Record<string, number>;
  permits: Record<string, number>;
  cBand: Record<string, number>;
  fourCa: Record<string, number>;
  radiolines: Record<string, number>;
  bands: Record<string, { totalCells: number; totalStations: number; cells: Record<string, number>; stations: Record<string, number> }>;
}

export interface RegistrySnapshot {
  date: string;
  counters: GrowthCounters;
}

const bump = (record: Record<string, number>, key: string, by = 1) => { record[key] = (record[key] || 0) + by; };

/** Counts the current state of the database. Growth is never estimated: it only comes from comparing two of these. */
export function computeGrowthCounters(db: DatabaseSync, source: GrowthSource): GrowthCounters {
  const sql = source === 'ALL'
    ? "SELECT operators FROM towers WHERE status='APPROVED'"
    : source === 'UKE'
    ? `SELECT operators FROM towers WHERE status='APPROVED' AND ${ukeViewSql('towers')}`
    : "SELECT operators FROM towers WHERE status='APPROVED' AND source=?";

  const rows = (source === 'ALL' || source === 'UKE' ? db.prepare(sql).all() : db.prepare(sql).all(source)) as Array<{ operators: string }>;

  const counters: GrowthCounters = {
    totals: { stations: rows.length, cells: 0, permits: 0, cBand: 0, fourCa: 0, radiolines: 0 },
    stations: {}, cells: {}, permits: {}, cBand: {}, fourCa: {}, radiolines: {}, bands: {},
  };
  for (const b of STANDARD_GROWTH_BANDS) counters.bands[b.key] = { totalCells: 0, totalStations: 0, cells: {}, stations: {} };

  for (const row of rows) {
    let ops: any[] = [];
    try {
      ops = JSON.parse(row.operators);
    } catch {
      continue;
    }
    if (!Array.isArray(ops)) continue;

    let towerHasCBand = false;
    let towerHasFourCa = false;
    const towerMatchedBands = new Set<string>();

    for (const op of ops) {
      const opName = (op.name || 'Inne').trim();
      bump(counters.stations, opName);

      const bList = Array.isArray(op.bands) ? op.bands : (Array.isArray(op.cells) ? op.cells : []);
      const sectorsOf = (b: any) => Number(b.sectors) || (Array.isArray(b.azimuths) && b.azimuths.length > 0 ? b.azimuths.length : 3);
      const opSectorsSum = bList.reduce((acc: number, b: any) => acc + sectorsOf(b), 0);

      counters.totals.cells += opSectorsSum;
      counters.totals.permits += bList.length;
      bump(counters.cells, opName, opSectorsSum);
      bump(counters.permits, opName, bList.length);

      const lteBands = new Set<string>();
      let opHasCBand = false;
      const opMatchedBandsOnTower = new Set<string>();

      for (const b of bList) {
        let tech = String(b.tech || 'Inne').toUpperCase();
        if (tech === 'NR') tech = '5G';
        const bandNum = String(b.band || '').replace(/MHz/i, '').trim();

        if (tech === 'LTE' && bandNum) lteBands.add(bandNum);
        if (tech === '5G' && (bandNum === '3500' || bandNum === '3600' || bandNum === 'n78' || bandNum === '78')) {
          opHasCBand = true;
          towerHasCBand = true;
        }

        for (const target of STANDARD_GROWTH_BANDS) {
          if (matchesGrowthBand(b, target)) {
            const tracker = counters.bands[target.key];
            tracker.totalCells += sectorsOf(b);
            bump(tracker.cells, opName, sectorsOf(b));
            opMatchedBandsOnTower.add(target.key);
            towerMatchedBands.add(target.key);
          }
        }
      }

      for (const bandKey of opMatchedBandsOnTower) bump(counters.bands[bandKey].stations, opName);
      if (opHasCBand) bump(counters.cBand, opName);
      if (lteBands.size >= 4) {
        bump(counters.fourCa, opName);
        towerHasFourCa = true;
      }
    }

    if (towerHasCBand) counters.totals.cBand++;
    if (towerHasFourCa) counters.totals.fourCa++;
    for (const bandKey of towerMatchedBands) counters.bands[bandKey].totalStations++;
  }

  const rlRows = db.prepare('SELECT operator, COUNT(*) AS cnt FROM radiolines GROUP BY operator').all() as Array<{ operator: string | null; cnt: number }>;
  for (const r of rlRows) {
    bump(counters.radiolines, r.operator || 'Inne', Number(r.cnt));
    counters.totals.radiolines += Number(r.cnt);
  }
  return counters;
}

const isoDate = (value: unknown) => {
  const day = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
};

/**
 * Stores the current counters for the UKE and BTMap sources under the given registry date.
 * Called after every UKE registry sync; two consecutive snapshots are what a growth report compares.
 */
export function recordRegistrySnapshot(db: DatabaseSync, date?: string): string {
  const meta = (key: string) => (db.prepare('SELECT value FROM metadata WHERE key=?').get(key) as { value?: string } | undefined)?.value;
  const day = isoDate(date) || isoDate(meta('ukeWykazDate')) || isoDate(meta('importedAt')) || new Date().toISOString().slice(0, 10);
  const save = db.prepare('INSERT OR REPLACE INTO registry_snapshots(date, source, data, createdAt) VALUES (?, ?, ?, ?)');
  const now = new Date().toISOString();
  for (const source of ['UKE', 'BTMAP'] as const) save.run(day, source, JSON.stringify(computeGrowthCounters(db, source)), now);
  cache.clear();
  return day;
}

/** Records a baseline for databases that predate snapshots, so the next sync has something to compare with. */
export function ensureRegistrySnapshot(db: DatabaseSync): void {
  if (!db.prepare('SELECT 1 FROM registry_snapshots LIMIT 1').get()) recordRegistrySnapshot(db);
}

/** Newest first. */
export function loadRegistrySnapshots(db: DatabaseSync, source: GrowthSource, limit = 13): RegistrySnapshot[] {
  const rows = db.prepare('SELECT date, data FROM registry_snapshots WHERE source=? ORDER BY createdAt DESC, date DESC LIMIT ?')
    .all(source === 'BTMAP' ? 'BTMAP' : 'UKE', limit) as Array<{ date: string; data: string }>;
  const snapshots: RegistrySnapshot[] = [];
  for (const row of rows) {
    try { snapshots.push({ date: row.date, counters: JSON.parse(row.data) }); } catch { /* A corrupt snapshot is skipped, not guessed. */ }
  }
  return snapshots;
}

const plDate = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

function buildGrowthReport(source: GrowthSource, current: RegistrySnapshot, previous: RegistrySnapshot | null): StatsPeriodReport {
  const cur = current.counters;
  const prev = previous?.counters || null;
  const PRIMARY_OPS = ['Plus', 'T-Mobile', 'Orange', 'Play'];
  const allOps = Array.from(new Set([...PRIMARY_OPS, ...Object.keys(cur.stations).filter(op => cur.stations[op] > 0)]));

  // Net growth since the previous snapshot. Without one there is nothing to compare, so growth stays 0.
  const bars = (now: Record<string, number> = {}, before?: Record<string, number>): StatsGrowthOperatorBar[] => allOps.map(op => {
    const total = now[op] || 0;
    const newCount = before ? Math.max(0, total - (before[op] || 0)) : 0;
    return { operator: op, total, newCount, newPercent: total > 0 ? Number(((newCount / total) * 100).toFixed(2)) : 0 };
  });
  const metric = (key: string, label: string, total: number, operators: StatsGrowthOperatorBar[]): StatsGrowthMetricCard =>
    ({ key, label, total, newTotal: operators.reduce((sum, o) => sum + o.newCount, 0), operators });

  const bands: StatsGrowthBandCard[] = STANDARD_GROWTH_BANDS.map(tb => {
    const now = cur.bands?.[tb.key] || { totalCells: 0, totalStations: 0, cells: {}, stations: {} };
    const before = prev ? prev.bands?.[tb.key] || { totalCells: 0, totalStations: 0, cells: {}, stations: {} } : undefined;
    const operatorCells = bars(now.cells, before?.cells);
    const operatorStations = bars(now.stations, before?.stations);
    return {
      key: tb.key,
      tech: tb.tech,
      band: tb.band,
      duplex: tb.duplex,
      totalCells: now.totalCells,
      newCells: operatorCells.reduce((sum, o) => sum + o.newCount, 0),
      totalStations: now.totalStations,
      newStations: operatorStations.reduce((sum, o) => sum + o.newCount, 0),
      operatorCells,
      operatorStations,
    };
  });

  return {
    id: `${source.toLowerCase()}-${current.date}`,
    title: previous ? `Wykaz z ${plDate(current.date)}` : `Stan na ${plDate(current.date)}`,
    dateRange: previous
      ? `Przyrost netto względem wykazu z ${plDate(previous.date)}`
      : 'Brak danych porównawczych – przyrost pojawi się po kolejnej synchronizacji wykazu UKE',
    comparedTo: previous?.date || null,
    source,
    metrics: {
      stations: metric('stations', 'Stacje bazowe', cur.totals.stations, bars(cur.stations, prev?.stations)),
      cells: metric('cells', 'Komórki / Sektory', cur.totals.cells, bars(cur.cells, prev?.cells)),
      cBand: metric('cBand', 'Stacje 5G C-Band (3.6 GHz)', cur.totals.cBand, bars(cur.cBand, prev?.cBand)),
      fourBandLte: metric('fourBandLte', 'Agregacja 4CA LTE', cur.totals.fourCa, bars(cur.fourCa, prev?.fourCa)),
      radiolines: metric('radiolines', 'Linie radiowe', cur.totals.radiolines, bars(cur.radiolines, prev?.radiolines)),
      permits: metric('permits', source === 'BTMAP' ? 'Pozwolenia radiowe / PCI' : 'Pozwolenia radiowe / Wpisy', cur.totals.permits, bars(cur.permits, prev?.permits)),
    },
    bands,
  };
}

/**
 * One report per synced registry, newest first, each compared with the registry before it.
 * Until two registries have been synced there is a single report with totals and no growth figures.
 */
export function computeMonthlyReports(db: DatabaseSync, source: GrowthSource): StatsPeriodReport[] {
  const targetSrc: GrowthSource = source === 'BTMAP' ? 'BTMAP' : 'UKE';
  const snapshots = loadRegistrySnapshots(db, targetSrc);
  if (snapshots.length < 2) {
    const live: RegistrySnapshot = { date: snapshots[0]?.date || recordDate(db), counters: computeGrowthCounters(db, targetSrc) };
    return [buildGrowthReport(targetSrc, live, null)];
  }
  return snapshots.slice(0, -1).map((snapshot, idx) => buildGrowthReport(targetSrc, snapshot, snapshots[idx + 1]));
}

function recordDate(db: DatabaseSync): string {
  const row = db.prepare("SELECT value FROM metadata WHERE key='ukeWykazDate'").get() as { value?: string } | undefined;
  return isoDate(row?.value) || new Date().toISOString().slice(0, 10);
}

/** New stations per synced registry, oldest first. Empty until there are two registries to compare. */
function buildGrowthTimeline(db: DatabaseSync, source: GrowthSource): StatsTimelineItem[] {
  const reports = computeMonthlyReports(db, source).filter(report => report.comparedTo);
  return reports.reverse().map(report => {
    const period = report.id.slice(report.id.indexOf('-') + 1);
    const bandCounts = new Map<string, number>();
    for (const b of report.bands) {
      if (b.newStations > 0) bandCounts.set(`${b.tech} ${b.band}`, (bandCounts.get(`${b.tech} ${b.band}`) || 0) + b.newStations);
    }
    return {
      period,
      label: `${new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${period}T00:00:00Z`))} (wykaz UKE)`,
      totalNew: report.metrics.stations.newTotal,
      operators: report.metrics.stations.operators.filter(o => o.newCount > 0).map(o => ({ operator: o.operator, count: o.newCount })).sort((a, b) => b.count - a.count),
      topBands: Array.from(bandCounts, ([band, count]) => ({ band, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    };
  });
}


export function getTelecomStats(db: DatabaseSync, rawSource?: string): TelecomStats {
  const source = rawSource === 'BTMAP' ? 'BTMAP' : rawSource === 'UKE' ? 'UKE' : 'ALL';
  const cached = cache.get(source);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const allCounts = db.prepare(
    "SELECT source, COUNT(*) as c FROM towers WHERE status='APPROVED' GROUP BY source"
  ).all() as Array<{ source: string; c: number }>;
  const ukeTowersTotal = allCounts.find(r => r.source === 'UKE')?.c || 0;
  const btmapTowersTotal = allCounts.find(r => r.source === 'BTMAP')?.c || 0;

  const sql = source === 'ALL'
    ? "SELECT id, lat, lng, stationId, address, province, operators, source, createdAt FROM towers WHERE status='APPROVED'"
    : source === 'UKE'
    ? `SELECT id, lat, lng, stationId, address, province, operators, source, createdAt FROM towers WHERE status='APPROVED' AND ${ukeViewSql('towers')}`
    : "SELECT id, lat, lng, stationId, address, province, operators, source, createdAt FROM towers WHERE status='APPROVED' AND source=?";

  type TowerRow = {
    id: string;
    lat: number;
    lng: number;
    stationId: string | null;
    address: string | null;
    province: string | null;
    operators: string;
    source: string;
    createdAt: string | null;
  };

  const rows = (source === 'ALL' || source === 'UKE'
    ? db.prepare(sql).all()
    : db.prepare(sql).all(source)) as TowerRow[];

  const totalTowers = rows.length;
  let totalPermits = 0;
  let totalCells = 0;

  let withExplicitProvince = 0;
  let inferredProvince = 0;
  let withFullAddress = 0;
  let multiBandLteTowers = 0;
  let fourBandLteTowers = 0;
  let fiveGCBandTowers = 0;
  let fiveGDssTowers = 0;

  const techTowerSets = new Map<string, Set<string>>();
  const techPermits = new Map<string, number>();
  const opTowerSets = new Map<string, Set<string>>();
  const opPermits = new Map<string, number>();
  const bandTowerSets = new Map<string, Map<string, Set<string>>>();
  const provTowerSets = new Map<string, Map<string, Set<string>>>();
  const coordBuckets = new Map<string, Set<string>>();

  for (const row of rows) {
    const id = row.id;
    let prov = (row.province || '').trim();
    if (prov) {
      withExplicitProvince++;
    } else {
      prov = inferProvinceFromCoords(row.lat, row.lng);
      inferredProvince++;
    }

    if ((row.address || '').trim()) {
      withFullAddress++;
    }

    // Group co-located physical sites (~60m grid)
    const gridKey = `${row.lat.toFixed(3)}_${row.lng.toFixed(3)}`;
    if (!coordBuckets.has(gridKey)) coordBuckets.set(gridKey, new Set());

    let ops: any[] = [];
    try {
      ops = JSON.parse(row.operators);
    } catch {
      continue;
    }
    if (!Array.isArray(ops)) continue;

    const towerLteBands = new Set<string>();
    let towerHasCBand = false;
    let towerHasDss = false;

    for (const op of ops) {
      const opName = (op.name || 'Inne').trim();
      coordBuckets.get(gridKey)!.add(opName);

      if (!opTowerSets.has(opName)) opTowerSets.set(opName, new Set());
      opTowerSets.get(opName)!.add(id);

      if (prov) {
        if (!provTowerSets.has(prov)) provTowerSets.set(prov, new Map());
        const pMap = provTowerSets.get(prov)!;
        if (!pMap.has(opName)) pMap.set(opName, new Set());
        pMap.get(opName)!.add(id);
      }

      const bands = Array.isArray(op.bands) ? op.bands : [];
      const cells = Array.isArray(op.cells) ? op.cells : [];
      const items = bands.length === 0 && cells.length > 0 ? cells : bands;
      for (const b of items) {
        const bSectors = Number(b.sectors) || (Array.isArray(b.azimuths) && b.azimuths.length > 0 ? b.azimuths.length : 3);
        totalCells += bSectors;
        totalPermits++;
        let tech = String(b.tech || 'Inne').toUpperCase();
        if (tech === 'NR') tech = '5G';
        const bandNum = String(b.band || '').replace(/MHz/i, '').trim();
        const bandKey = `${tech} ${bandNum}`;

        if (tech === 'LTE' && bandNum) {
          towerLteBands.add(bandNum);
        }
        if (tech === '5G') {
          if (bandNum === '3500' || bandNum === '3600') towerHasCBand = true;
          if (bandNum === '2100' || bandNum === '700' || bandNum === '1800') towerHasDss = true;
        }

        if (!techTowerSets.has(tech)) techTowerSets.set(tech, new Set());
        techTowerSets.get(tech)!.add(id);
        techPermits.set(tech, (techPermits.get(tech) || 0) + 1);
        opPermits.set(opName, (opPermits.get(opName) || 0) + 1);

        if (!bandTowerSets.has(bandKey)) bandTowerSets.set(bandKey, new Map());
        const bMap = bandTowerSets.get(bandKey)!;
        if (!bMap.has(opName)) bMap.set(opName, new Set());
        bMap.get(opName)!.add(id);
      }
    }

    if (towerLteBands.size >= 3) multiBandLteTowers++;
    if (towerLteBands.size >= 4) fourBandLteTowers++;
    if (towerHasCBand) fiveGCBandTowers++;
    if (towerHasDss) fiveGDssTowers++;
  }

  let collocatedTowers = 0;
  for (const opsSet of coordBuckets.values()) {
    if (opsSet.size >= 2) collocatedTowers++;
  }

  // Technologies
  const standardTechs = ['5G', 'LTE', 'UMTS', 'GSM', 'IOT', 'GSM-R', 'CDMA'];
  const technologies: StatsTechItem[] = [];
  for (const tech of standardTechs) {
    const towers = techTowerSets.get(tech)?.size || 0;
    const permits = techPermits.get(tech) || 0;
    if (towers > 0 || permits > 0) {
      technologies.push({
        tech,
        towers,
        permits,
        percent: totalTowers > 0 ? Number(((towers / totalTowers) * 100).toFixed(1)) : 0,
        permitPercent: totalPermits > 0 ? Number(((permits / totalPermits) * 100).toFixed(1)) : 0,
      });
    }
  }
  for (const [tech, set] of techTowerSets) {
    if (!standardTechs.includes(tech)) {
      const permits = techPermits.get(tech) || 0;
      technologies.push({
        tech,
        towers: set.size,
        permits,
        percent: totalTowers > 0 ? Number(((set.size / totalTowers) * 100).toFixed(1)) : 0,
        permitPercent: totalPermits > 0 ? Number(((permits / totalPermits) * 100).toFixed(1)) : 0,
      });
    }
  }

  // Operators
  const operators: StatsOperatorItem[] = Array.from(opTowerSets.entries())
    .map(([name, set]) => {
      const permits = opPermits.get(name) || 0;
      return {
        name,
        towers: set.size,
        permits,
        percent: totalTowers > 0 ? Number(((set.size / totalTowers) * 100).toFixed(2)) : 0,
        permitPercent: totalPermits > 0 ? Number(((permits / totalPermits) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.towers - a.towers);

  // Bands (sorted in telecom order)
  const techOrder: Record<string, number> = { '5G': 1, 'LTE': 2, 'UMTS': 3, 'GSM': 4, 'GSM-R': 5, 'IOT': 6, 'CDMA': 7 };
  const bands: StatsBandItem[] = Array.from(bandTowerSets.entries())
    .map(([bandKey, opMap]) => {
      const [tech, ...rest] = bandKey.split(' ');
      const bandNum = rest.join(' ');
      const totalBandTowers = new Set(Array.from(opMap.values()).flatMap(s => Array.from(s))).size;
      const opBreakdown = Array.from(opMap.entries())
        .map(([op, set]) => ({ operator: op, count: set.size }))
        .sort((a, b) => b.count - a.count);
      return {
        key: bandKey,
        tech,
        band: bandNum,
        total: totalBandTowers,
        operators: opBreakdown,
      };
    })
    .sort((a, b) => {
      const toA = techOrder[a.tech] || 99;
      const toB = techOrder[b.tech] || 99;
      if (toA !== toB) return toA - toB;
      const nA = parseInt(a.band, 10) || 0;
      const nB = parseInt(b.band, 10) || 0;
      return nA - nB;
    });

  // Provinces (16 sorted descending by station count)
  const provinces: StatsProvinceItem[] = Array.from(provTowerSets.entries())
    .map(([province, opMap]) => {
      const totalProvTowers = new Set(Array.from(opMap.values()).flatMap(s => Array.from(s))).size;
      const opBreakdown = Array.from(opMap.entries())
        .map(([op, set]) => ({ operator: op, count: set.size }))
        .sort((a, b) => b.count - a.count);
      return {
        province,
        total: totalProvTowers,
        operators: opBreakdown,
      };
    })
    .sort((a, b) => b.total - a.total);

  const radiolines = computeRadiolinesStats(db);

  const pemPlansRow = db.prepare('SELECT COUNT(*) as c FROM pem_plans').get() as { c: number } | undefined;
  const pemCountsRow = db.prepare(
    'SELECT SUM(CASE WHEN count > 0 THEN 1 ELSE 0 END) as withReports, SUM(count) as sumReports FROM pem_report_counts'
  ).get() as { withReports: number | null; sumReports: number | null } | undefined;
  const ukeDateRow = db.prepare("SELECT value FROM metadata WHERE key = 'ukeWykazDate'").get() as { value?: string } | undefined;

  const timeline = buildGrowthTimeline(db, source);
  const latestNewTowers = timeline[timeline.length - 1]?.totalNew ?? 0;
  const latestNewDate = loadRegistrySnapshots(db, source, 1)[0]?.date || ukeDateRow?.value || null;

  // Cached comparison between UKE and BTMAP bands
  let comparisonBands: StatsComparisonBandItem[];
  if (cachedComparisonBands && Date.now() - cachedComparisonAt < CACHE_TTL_MS) {
    comparisonBands = cachedComparisonBands;
  } else {
    const ukeBandCounts = new Map<string, number>();
    const btmapBandCounts = new Map<string, number>();

    const allTowersWithSource = db.prepare(
      "SELECT source, operators FROM towers WHERE status='APPROVED'"
    ).all() as Array<{ source: string; operators: string }>;

    for (const t of allTowersWithSource) {
      const isUke = t.source === 'UKE';
      const targetMap = isUke ? ukeBandCounts : btmapBandCounts;
      try {
        const ops = JSON.parse(t.operators);
        if (Array.isArray(ops)) {
          for (const op of ops) {
            const bList = Array.isArray(op.bands) ? op.bands : (Array.isArray(op.cells) ? op.cells : []);
            for (const b of bList) {
              let tech = String(b.tech || 'Inne').toUpperCase();
              if (tech === 'NR') tech = '5G';
              const bandNum = String(b.band || '').replace(/MHz/i, '').trim();
              if (bandNum) {
                const bKey = `${tech} ${bandNum}`;
                targetMap.set(bKey, (targetMap.get(bKey) || 0) + 1);
              }
            }
          }
        }
      } catch {}
    }

    const allBandKeys = new Set([...ukeBandCounts.keys(), ...btmapBandCounts.keys()]);
    comparisonBands = Array.from(allBandKeys).map(key => {
      const [tech, ...rest] = key.split(' ');
      return {
        key,
        tech,
        band: rest.join(' '),
        ukeTotal: ukeBandCounts.get(key) || 0,
        btmapTotal: btmapBandCounts.get(key) || 0,
      };
    }).sort((a, b) => (techOrder[a.tech] || 99) - (techOrder[b.tech] || 99) || (parseInt(a.band, 10) || 0) - (parseInt(b.band, 10) || 0));

    cachedComparisonBands = comparisonBands;
    cachedComparisonAt = Date.now();
  }

  const dataQuality: StatsDataQuality = {
    totalTowers,
    ukeTowers: ukeTowersTotal,
    btmapTowers: btmapTowersTotal,
    withExplicitProvince,
    inferredProvince,
    withFullAddress,
    multiBandLteTowers,
    fourBandLteTowers,
    fiveGCBandTowers,
    fiveGDssTowers,
    collocatedTowers,
    pemPlansCount: pemPlansRow?.c || 0,
    pemCachedTowers: pemCountsRow?.withReports || 0,
    pemCachedReports: pemCountsRow?.sumReports || 0,
    ukeWykazDate: ukeDateRow?.value || null,
    radiolinesUpdatedAt: radiolines.updatedAt,
  };

  const monthlyReports = computeMonthlyReports(db, source);

  const result: TelecomStats = {
    source,
    summary: {
      totalTowers,
      totalPermits,
      totalCells,
      ukeTowers: ukeTowersTotal,
      btmapTowers: btmapTowersTotal,
      latestNewTowers,
      latestNewDate,
    },
    technologies,
    operators,
    bands,
    provinces,
    timeline,
    monthlyReports,
    comparison: {
      bands: comparisonBands,
    },
    radiolines,
    dataQuality,
    updatedAt: new Date().toISOString(),
  };

  cache.set(source, { at: Date.now(), data: result });
  return result;
}

export function warmStatsCache(db: DatabaseSync): void {
  setTimeout(() => {
    try {
      getTelecomStats(db, 'UKE');
      getTelecomStats(db, 'BTMAP');
    } catch (e) {
      console.error('[stats] Cache prewarm error:', e);
    }
  }, 100);
}
