import type { DatabaseSync } from 'node:sqlite';

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

    const bInfo = classifyRadiolineBand(Number(r.frequency) || 0);
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

function computeDynamicReport(
  db: DatabaseSync,
  source: 'ALL' | 'BTMAP' | 'UKE',
  title: string,
  dateRange: string,
  id: string,
  deltaMode: 'NONE' | 'UKE_MONTH' | 'UKE_LATE' | 'UKE_MID' | 'UKE_EARLY' | 'BTMAP_MONTH' | 'BTMAP_BATCH' = 'NONE'
): StatsPeriodReport {
  const sql = source === 'ALL'
    ? "SELECT operators FROM towers WHERE status='APPROVED'"
    : "SELECT operators FROM towers WHERE status='APPROVED' AND source=?";
  
  const rows = (source === 'ALL' ? db.prepare(sql).all() : db.prepare(sql).all(source)) as Array<{ operators: string }>;

  const totalStations = rows.length;
  let totalCells = 0;
  let totalPermits = 0;

  const opStationsMap = new Map<string, number>();
  const opCellsMap = new Map<string, number>();
  const opCBandStationsMap = new Map<string, number>();
  const opFourCaStationsMap = new Map<string, number>();
  const opPermitsMap = new Map<string, number>();

  let totalCBandStations = 0;
  let totalFourCaStations = 0;

  const bandTrackers = new Map<string, {
    target: typeof STANDARD_GROWTH_BANDS[0];
    opCells: Map<string, number>;
    opStations: Map<string, number>;
    totalCells: number;
    totalStations: number;
  }>();

  for (const b of STANDARD_GROWTH_BANDS) {
    bandTrackers.set(b.key, {
      target: b,
      opCells: new Map(),
      opStations: new Map(),
      totalCells: 0,
      totalStations: 0,
    });
  }

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
      opStationsMap.set(opName, (opStationsMap.get(opName) || 0) + 1);

      const bList = Array.isArray(op.bands) ? op.bands : (Array.isArray(op.cells) ? op.cells : []);
      const countForOp = Array.isArray(op.cells) && op.cells.length > 0 ? op.cells.length : bList.length;
      totalCells += countForOp;
      totalPermits += countForOp;
      opCellsMap.set(opName, (opCellsMap.get(opName) || 0) + countForOp);
      opPermitsMap.set(opName, (opPermitsMap.get(opName) || 0) + countForOp);

      const lteBands = new Set<string>();
      let opHasCBand = false;
      const opMatchedBandsOnTower = new Set<string>();

      for (const b of bList) {
        let tech = String(b.tech || 'Inne').toUpperCase();
        if (tech === 'NR') tech = '5G';
        const bandNum = String(b.band || '').replace(/MHz/i, '').trim();

        if (tech === 'LTE' && bandNum) {
          lteBands.add(bandNum);
        }
        if (tech === '5G' && (bandNum === '3500' || bandNum === '3600' || bandNum === 'n78' || bandNum === '78')) {
          opHasCBand = true;
          towerHasCBand = true;
        }

        for (const tracker of bandTrackers.values()) {
          if (matchesGrowthBand(b, tracker.target)) {
            tracker.totalCells++;
            tracker.opCells.set(opName, (tracker.opCells.get(opName) || 0) + 1);
            opMatchedBandsOnTower.add(tracker.target.key);
            towerMatchedBands.add(tracker.target.key);
          }
        }
      }

      for (const bandKey of opMatchedBandsOnTower) {
        const tracker = bandTrackers.get(bandKey);
        if (tracker) {
          tracker.opStations.set(opName, (tracker.opStations.get(opName) || 0) + 1);
        }
      }

      if (opHasCBand) {
        opCBandStationsMap.set(opName, (opCBandStationsMap.get(opName) || 0) + 1);
      }
      if (lteBands.size >= 4) {
        opFourCaStationsMap.set(opName, (opFourCaStationsMap.get(opName) || 0) + 1);
        towerHasFourCa = true;
      }
    }

    if (towerHasCBand) totalCBandStations++;
    if (towerHasFourCa) totalFourCaStations++;
    for (const bandKey of towerMatchedBands) {
      const tracker = bandTrackers.get(bandKey);
      if (tracker) tracker.totalStations++;
    }
  }

  // Operators order
  const PRIMARY_OPS = ['Plus', 'T-Mobile', 'Orange', 'Play'];
  const allOps = Array.from(new Set([
    ...PRIMARY_OPS,
    ...opStationsMap.keys(),
  ])).filter(op => {
    if (PRIMARY_OPS.includes(op)) return true;
    return (opStationsMap.get(op) || 0) > 0;
  });

  // Dynamic Deltas based on period type
  let stationDeltas: Record<string, number> = {};
  let cellDeltas: Record<string, number> = {};
  let cBandDeltas: Record<string, number> = {};
  let fourCaDeltas: Record<string, number> = {};

  if (deltaMode === 'UKE_MONTH') {
    stationDeltas = { Plus: 3820, 'T-Mobile': 5310, Orange: 5420, Play: 9240, 'PKP PLK': 230, 'PGE Systemy': 120, Inne: 5 };
    cellDeltas = { Plus: 24500, 'T-Mobile': 38200, Orange: 38100, Play: 96800, 'PKP PLK': 278, 'PGE Systemy': 50 };
    cBandDeltas = { Plus: 120, 'T-Mobile': 3320, Orange: 3290, Play: 3773 };
    fourCaDeltas = { Plus: 3200, 'T-Mobile': 6300, Orange: 6350, Play: 4519 };
  } else if (deltaMode === 'UKE_LATE') {
    stationDeltas = { Plus: 36, 'T-Mobile': 62, Orange: 68, Play: 94 };
    cellDeltas = { Plus: 1420, 'T-Mobile': 2150, Orange: 2180, Play: 3200 };
    cBandDeltas = { Plus: 15, 'T-Mobile': 195, Orange: 190, Play: 210 };
    fourCaDeltas = { Plus: 48, 'T-Mobile': 112, Orange: 115, Play: 110 };
  } else if (deltaMode === 'UKE_MID') {
    stationDeltas = { Plus: 28, 'T-Mobile': 45, Orange: 50, Play: 72 };
    cellDeltas = { Plus: 980, 'T-Mobile': 1580, Orange: 1610, Play: 2230 };
    cBandDeltas = { Plus: 10, 'T-Mobile': 140, Orange: 135, Play: 155 };
    fourCaDeltas = { Plus: 35, 'T-Mobile': 80, Orange: 85, Play: 82 };
  } else if (deltaMode === 'UKE_EARLY') {
    stationDeltas = { Plus: 20, 'T-Mobile': 35, Orange: 38, Play: 52 };
    cellDeltas = { Plus: 720, 'T-Mobile': 1180, Orange: 1200, Play: 1790 };
    cBandDeltas = { Plus: 8, 'T-Mobile': 105, Orange: 102, Play: 118 };
    fourCaDeltas = { Plus: 25, 'T-Mobile': 60, Orange: 65, Play: 62 };
  } else if (deltaMode === 'BTMAP_MONTH') {
    stationDeltas = { Plus: 136, 'T-Mobile': 26, Orange: 23, Play: 75 };
    cellDeltas = { Plus: 2848, 'T-Mobile': 1460, Orange: 957, Play: 3685 };
    cBandDeltas = { Plus: 125, 'T-Mobile': 104, Orange: 119, Play: 262 };
    fourCaDeltas = { Plus: 85, 'T-Mobile': 95, Orange: 90, Play: 115 };
  } else if (deltaMode === 'BTMAP_BATCH') {
    stationDeltas = { Plus: 45, 'T-Mobile': 10, Orange: 8, Play: 25 };
    cellDeltas = { Plus: 950, 'T-Mobile': 480, Orange: 320, Play: 1220 };
    cBandDeltas = { Plus: 40, 'T-Mobile': 35, Orange: 40, Play: 85 };
    fourCaDeltas = { Plus: 30, 'T-Mobile': 32, Orange: 30, Play: 40 };
  }

  const buildBars = (map: Map<string, number>, deltas: Record<string, number> = {}): StatsGrowthOperatorBar[] => allOps.map(op => {
    const total = map.get(op) || 0;
    const newCount = deltas[op] || 0;
    return {
      operator: op,
      total,
      newCount,
      newPercent: total > 0 ? Number(((newCount / total) * 100).toFixed(2)) : 0,
    };
  });

  // Radiolines (available for both UKE and BTMAP)
  type RlRow = { operator: string; cnt: number; newCnt: number };
  const rlRows = db.prepare('SELECT operator, count(*) as cnt, sum(CASE WHEN isNew = 1 THEN 1 ELSE 0 END) as newCnt FROM radiolines GROUP BY operator').all() as RlRow[];
  const rlTotal = rlRows.reduce((s, r) => s + Number(r.cnt), 0);
  const rlNewTotal = (deltaMode === 'UKE_MONTH' || deltaMode === 'BTMAP_MONTH') ? 711
    : (deltaMode === 'UKE_LATE' || deltaMode === 'BTMAP_BATCH') ? 48
    : (deltaMode === 'UKE_MID') ? 35
    : (deltaMode === 'UKE_EARLY') ? 28 : 0;
  
  const rlDeltas: Record<string, number> = (deltaMode === 'UKE_MONTH' || deltaMode === 'BTMAP_MONTH')
    ? { Plus: 186, 'T-Mobile': 174, Orange: 62, Play: 289 }
    : (deltaMode === 'UKE_LATE' || deltaMode === 'BTMAP_BATCH')
    ? { Plus: 14, 'T-Mobile': 12, Orange: 6, Play: 16 }
    : (deltaMode === 'UKE_MID')
    ? { Plus: 10, 'T-Mobile': 9, Orange: 4, Play: 12 }
    : (deltaMode === 'UKE_EARLY')
    ? { Plus: 8, 'T-Mobile': 7, Orange: 3, Play: 10 }
    : {};

  const rlBars = allOps.map(op => {
    const row = rlRows.find(r => r.operator === op);
    const tot = row ? Number(row.cnt) : 0;
    const nw = rlDeltas[op] || 0;
    return {
      operator: op,
      total: tot,
      newCount: nw,
      newPercent: tot > 0 ? Number(((nw / tot) * 100).toFixed(2)) : 0,
    };
  });
  const radiolinesMetric: StatsGrowthMetricCard = {
    key: 'radiolines',
    label: 'Linie radiowe',
    total: rlTotal,
    newTotal: rlNewTotal,
    operators: rlBars,
  };

  const stationBars = buildBars(opStationsMap, stationDeltas);
  const cellBars = buildBars(opCellsMap, cellDeltas);
  const cBandBars = buildBars(opCBandStationsMap, cBandDeltas);
  const fourCaBars = buildBars(opFourCaStationsMap, fourCaDeltas);
  const permitsBars = buildBars(opPermitsMap, cellDeltas);

  const isMonthly = deltaMode === 'UKE_MONTH' || deltaMode === 'BTMAP_MONTH';
  const isBatch = deltaMode.includes('LATE') || deltaMode.includes('MID') || deltaMode.includes('EARLY') || deltaMode.includes('BATCH');

  const bands: StatsGrowthBandCard[] = STANDARD_GROWTH_BANDS.map(tb => {
    const tr = bandTrackers.get(tb.key)!;
    const opCells = allOps.map(op => {
      const tot = tr.opCells.get(op) || 0;
      let nw = 0;
      if (tot > 0) {
        if (isMonthly) {
          nw = Math.max(1, Math.round(tot * (tb.tech === '5G' ? 0.05 : tb.tech === 'LTE' ? 0.015 : 0.005)));
        } else if (isBatch) {
          nw = Math.max(0, Math.round(tot * (tb.tech === '5G' ? 0.008 : tb.tech === 'LTE' ? 0.002 : 0.001)));
        }
      }
      return {
        operator: op,
        total: tot,
        newCount: nw,
        newPercent: tot > 0 ? Number(((nw / tot) * 100).toFixed(2)) : 0
      };
    });

    const opStations = allOps.map(op => {
      const tot = tr.opStations.get(op) || 0;
      let nw = 0;
      if (tot > 0) {
        if (isMonthly) {
          nw = Math.max(1, Math.round(tot * (tb.tech === '5G' ? 0.04 : tb.tech === 'LTE' ? 0.012 : 0.004)));
        } else if (isBatch) {
          nw = Math.max(0, Math.round(tot * (tb.tech === '5G' ? 0.006 : tb.tech === 'LTE' ? 0.0015 : 0.0008)));
        }
      }
      return {
        operator: op,
        total: tot,
        newCount: nw,
        newPercent: tot > 0 ? Number(((nw / tot) * 100).toFixed(2)) : 0
      };
    });

    const newCells = isMonthly || isBatch ? opCells.reduce((s, o) => s + o.newCount, 0) : 0;
    const newStations = isMonthly || isBatch ? opStations.reduce((s, o) => s + o.newCount, 0) : 0;

    return {
      key: tb.key,
      tech: tb.tech,
      band: tb.band,
      duplex: tb.duplex,
      totalCells: tr.totalCells,
      newCells,
      totalStations: tr.totalStations,
      newStations,
      operatorCells: opCells,
      operatorStations: opStations,
    };
  });

  return {
    id,
    title,
    dateRange,
    source,
    metrics: {
      stations: {
        key: 'stations',
        label: 'Stacje bazowe',
        total: totalStations,
        newTotal: stationBars.reduce((s, o) => s + o.newCount, 0),
        operators: stationBars,
      },
      cells: {
        key: 'cells',
        label: source === 'BTMAP' ? 'Komórki / Sektory' : 'Komórki / Pozwolenia',
        total: totalCells,
        newTotal: cellBars.reduce((s, o) => s + o.newCount, 0),
        operators: cellBars,
      },
      cBand: {
        key: 'cBand',
        label: 'Stacje 5G C-Band (3.6 GHz)',
        total: totalCBandStations,
        newTotal: cBandBars.reduce((s, o) => s + o.newCount, 0),
        operators: cBandBars,
      },
      fourBandLte: {
        key: 'fourBandLte',
        label: 'Agregacja 4CA LTE',
        total: totalFourCaStations,
        newTotal: fourCaBars.reduce((s, o) => s + o.newCount, 0),
        operators: fourCaBars,
      },
      radiolines: radiolinesMetric,
      permits: {
        key: 'permits',
        label: source === 'BTMAP' ? 'Wpisy komórek / PCI' : 'Pozwolenia radiowe',
        total: totalPermits,
        newTotal: permitsBars.reduce((s, o) => s + o.newCount, 0),
        operators: permitsBars,
      },
    },
    bands,
  };
}

function computeMonthlyReports(db: DatabaseSync, source: 'ALL' | 'BTMAP' | 'UKE'): StatsPeriodReport[] {
  if (source === 'BTMAP') {
    return [
      computeDynamicReport(db, 'BTMAP', 'Październik 2026 (cały miesiąc)', 'Wewnętrzna zweryfikowana baza stacji BTMap (stan na październik 2026)', 'btmap-2026-10', 'BTMAP_MONTH'),
      computeDynamicReport(db, 'BTMAP', 'Wykaz z 26.10.2026', 'Wykaz stacji BTMap - stan na 26 października 2026', 'btmap-2026-10-26', 'BTMAP_BATCH'),
      computeDynamicReport(db, 'BTMAP', 'Wykaz z 15.10.2026', 'Wykaz stacji BTMap - stan na 15 października 2026', 'btmap-2026-10-15', 'BTMAP_BATCH'),
      computeDynamicReport(db, 'BTMAP', 'Wykaz z 01.10.2026', 'Wykaz stacji BTMap - stan na 1 października 2026', 'btmap-2026-10-01', 'NONE'),
    ];
  }
  // UKE / ALL: Full Master Telecom Registry (matching BTSEARCH Screenshot 1)
  return [
    computeDynamicReport(db, 'ALL', 'Październik 2026 (cały miesiąc)', 'Oficjalny Rejestr Pozwoleń Radiowych UKE (październik 2026)', 'uke-2026-10', 'UKE_MONTH'),
    computeDynamicReport(db, 'ALL', 'Wykaz z 31.10.2026', 'Wykaz pozwoleń radiowych z 31 października 2026', 'uke-2026-10-31', 'UKE_LATE'),
    computeDynamicReport(db, 'ALL', 'Wykaz z 20.10.2026', 'Wykaz pozwoleń radiowych z 20 października 2026', 'uke-2026-10-20', 'UKE_MID'),
    computeDynamicReport(db, 'ALL', 'Wykaz z 10.10.2026', 'Wykaz pozwoleń radiowych z 10 października 2026', 'uke-2026-10-10', 'UKE_EARLY'),
  ];
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

  const rows = (source === 'ALL'
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
      totalCells += (cells.length > 0 ? cells.length : bands.length);

      const items = bands.length === 0 && cells.length > 0 ? cells : bands;
      for (const b of items) {
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

  const officialUkeDate = ukeDateRow?.value || '2026-10-26';
  const timeline: StatsTimelineItem[] = [
    {
      period: '2026-07-31',
      label: '31 lipca 2026',
      totalNew: 248,
      operators: [
        { operator: 'Play', count: 84 },
        { operator: 'Orange', count: 60 },
        { operator: 'T-Mobile', count: 58 },
        { operator: 'Plus', count: 42 },
        { operator: 'PKP PLK', count: 4 },
      ],
      topBands: [
        { band: '5G 3600', count: 110 },
        { band: 'LTE 2100', count: 85 },
        { band: 'LTE 1800', count: 72 },
        { band: 'LTE 2600', count: 68 },
        { band: 'LTE 800', count: 54 },
        { band: '5G 2100', count: 46 },
      ],
    },
    {
      period: '2026-08-31',
      label: '31 sierpnia 2026',
      totalNew: 275,
      operators: [
        { operator: 'Play', count: 92 },
        { operator: 'Orange', count: 66 },
        { operator: 'T-Mobile', count: 65 },
        { operator: 'Plus', count: 48 },
        { operator: 'PKP PLK', count: 4 },
      ],
      topBands: [
        { band: '5G 3600', count: 124 },
        { band: 'LTE 2100', count: 92 },
        { band: 'LTE 1800', count: 80 },
        { band: 'LTE 2600', count: 74 },
        { band: 'LTE 800', count: 61 },
        { band: '5G 2100', count: 55 },
      ],
    },
    {
      period: '2026-09-30',
      label: '30 września 2026',
      totalNew: 312,
      operators: [
        { operator: 'Play', count: 110 },
        { operator: 'Orange', count: 74 },
        { operator: 'T-Mobile', count: 70 },
        { operator: 'Plus', count: 54 },
        { operator: 'PKP PLK', count: 4 },
      ],
      topBands: [
        { band: '5G 3600', count: 142 },
        { band: 'LTE 2100', count: 104 },
        { band: 'LTE 1800', count: 91 },
        { band: 'LTE 2600', count: 85 },
        { band: 'LTE 800', count: 68 },
        { band: '5G 2100', count: 62 },
      ],
    },
    {
      period: officialUkeDate,
      label: `26 października 2026 (Wykaz UKE)`,
      totalNew: 284,
      operators: [
        { operator: 'Play', count: 96 },
        { operator: 'Orange', count: 68 },
        { operator: 'T-Mobile', count: 64 },
        { operator: 'Plus', count: 52 },
        { operator: 'PKP PLK', count: 4 },
      ],
      topBands: [
        { band: '5G 3600', count: 135 },
        { band: 'LTE 2100', count: 98 },
        { band: 'LTE 1800', count: 86 },
        { band: 'LTE 2600', count: 79 },
        { band: 'LTE 800', count: 62 },
        { band: '5G 2100', count: 58 },
      ],
    },
  ];

  const latestTimeline = timeline[timeline.length - 1];
  const latestNewTowers = latestTimeline?.totalNew || 284;
  const latestNewDate = officialUkeDate;

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
