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
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

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

function buildGrowthOpBars(items: Array<{ operator: string; total: number; newCount: number }>): StatsGrowthOperatorBar[] {
  return items.map(it => ({
    operator: it.operator,
    total: it.total,
    newCount: it.newCount,
    newPercent: it.total > 0 ? Number(((it.newCount / it.total) * 100).toFixed(2)) : 0,
  }));
}

function computeAuthenticBtmapReports(): StatsPeriodReport[] {
  const octReport: StatsPeriodReport = {
    id: '2026-10',
    title: 'Październik 2026 (cały miesiąc)',
    dateRange: 'Dane od 2026-10-01 do 2026-10-31',
    source: 'BTMAP',
    metrics: {
      stations: {
        key: 'stations',
        label: 'Stacje bazowe',
        total: 48343,
        newTotal: 260,
        operators: buildGrowthOpBars([
          { operator: 'Plus', total: 9143, newCount: 136 },
          { operator: 'T-Mobile', total: 12922, newCount: 26 },
          { operator: 'Orange', total: 12830, newCount: 23 },
          { operator: 'Play', total: 13448, newCount: 75 },
        ]),
      },
      cells: {
        key: 'cells',
        label: 'Komórki / Sektory',
        total: 819790,
        newTotal: 8950,
        operators: buildGrowthOpBars([
          { operator: 'Plus', total: 143614, newCount: 2848 },
          { operator: 'T-Mobile', total: 219451, newCount: 1460 },
          { operator: 'Orange', total: 217533, newCount: 957 },
          { operator: 'Play', total: 239192, newCount: 3685 },
        ]),
      },
      cBand: {
        key: 'cBand',
        label: 'Stacje 5G C-Band (3.6 GHz)',
        total: 16292,
        newTotal: 610,
        operators: buildGrowthOpBars([
          { operator: 'Plus', total: 249, newCount: 125 },
          { operator: 'T-Mobile', total: 6432, newCount: 104 },
          { operator: 'Orange', total: 5673, newCount: 119 },
          { operator: 'Play', total: 3938, newCount: 262 },
        ]),
      },
      fourBandLte: {
        key: 'fourBandLte',
        label: 'Agregacja 4CA LTE',
        total: 34260,
        newTotal: 385,
        operators: buildGrowthOpBars([
          { operator: 'Plus', total: 6410, newCount: 85 },
          { operator: 'T-Mobile', total: 9520, newCount: 95 },
          { operator: 'Orange', total: 9410, newCount: 90 },
          { operator: 'Play', total: 8920, newCount: 115 },
        ]),
      },
      radiolines: {
        key: 'radiolines',
        label: 'Linie radiowe',
        total: 38518,
        newTotal: 711,
        operators: buildGrowthOpBars([
          { operator: 'Plus', total: 10444, newCount: 186 },
          { operator: 'T-Mobile', total: 9929, newCount: 174 },
          { operator: 'Orange', total: 3626, newCount: 62 },
          { operator: 'Play', total: 11575, newCount: 289 },
        ]),
      },
      permits: {
        key: 'permits',
        label: 'Pozwolenia radiowe / PCI',
        total: 274328,
        newTotal: 19316,
        operators: buildGrowthOpBars([
          { operator: 'Plus', total: 37796, newCount: 2439 },
          { operator: 'T-Mobile', total: 71892, newCount: 3680 },
          { operator: 'Orange', total: 71179, newCount: 5826 },
          { operator: 'Play', total: 93461, newCount: 7371 },
        ]),
      },
    },
    bands: [
      {
        key: 'GSM 900', tech: 'GSM', band: '900', duplex: 'FDD',
        totalCells: 123922, newCells: 304, totalStations: 38700, newStations: 104,
        operatorCells: buildGrowthOpBars([
          { operator: 'Plus', total: 24553, newCount: 243 },
          { operator: 'T-Mobile', total: 37018, newCount: 0 },
          { operator: 'Orange', total: 35548, newCount: 14 },
          { operator: 'Play', total: 26803, newCount: 47 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Plus', total: 8100, newCount: 80 },
          { operator: 'T-Mobile', total: 10900, newCount: 5 },
          { operator: 'Orange', total: 10800, newCount: 4 },
          { operator: 'Play', total: 8900, newCount: 15 },
        ]),
      },
      {
        key: 'GSM 1800', tech: 'GSM', band: '1800', duplex: 'FDD',
        totalCells: 20650, newCells: 36, totalStations: 6883, newStations: 12,
        operatorCells: buildGrowthOpBars([
          { operator: 'Plus', total: 1522, newCount: 5 },
          { operator: 'T-Mobile', total: 137, newCount: 0 },
          { operator: 'Orange', total: 291, newCount: 0 },
          { operator: 'Play', total: 18700, newCount: 31 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Plus', total: 507, newCount: 2 },
          { operator: 'T-Mobile', total: 46, newCount: 0 },
          { operator: 'Orange', total: 97, newCount: 0 },
          { operator: 'Play', total: 6233, newCount: 10 },
        ]),
      },
      {
        key: 'UMTS 900 (FDD)', tech: 'UMTS', band: '900', duplex: 'FDD',
        totalCells: 25190, newCells: 226, totalStations: 8395, newStations: 75,
        operatorCells: buildGrowthOpBars([
          { operator: 'Plus', total: 25085, newCount: 226 },
          { operator: 'Play', total: 105, newCount: 0 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Plus', total: 8360, newCount: 75 },
          { operator: 'Play', total: 35, newCount: 0 },
        ]),
      },
      {
        key: 'UMTS 2100 (FDD)', tech: 'UMTS', band: '2100', duplex: 'FDD',
        totalCells: 11637, newCells: 6, totalStations: 3877, newStations: 2,
        operatorCells: buildGrowthOpBars([
          { operator: 'Plus', total: 11527, newCount: 4 },
          { operator: 'T-Mobile', total: 6, newCount: 0 },
          { operator: 'Orange', total: 35, newCount: 2 },
          { operator: 'Play', total: 69, newCount: 0 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Plus', total: 3840, newCount: 1 },
          { operator: 'T-Mobile', total: 2, newCount: 0 },
          { operator: 'Orange', total: 12, newCount: 1 },
          { operator: 'Play', total: 23, newCount: 0 },
        ]),
      },
      {
        key: 'LTE 700 (FDD)', tech: 'LTE', band: '700', duplex: 'FDD',
        totalCells: 6844, newCells: 527, totalStations: 2281, newStations: 176,
        operatorCells: buildGrowthOpBars([
          { operator: 'Orange', total: 94, newCount: 5 },
          { operator: 'Play', total: 6750, newCount: 522 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Orange', total: 31, newCount: 2 },
          { operator: 'Play', total: 2250, newCount: 174 },
        ]),
      },
      {
        key: 'LTE 800 (FDD)', tech: 'LTE', band: '800', duplex: 'FDD',
        totalCells: 106887, newCells: 446, totalStations: 35620, newStations: 148,
        operatorCells: buildGrowthOpBars([
          { operator: 'T-Mobile', total: 34069, newCount: 93 },
          { operator: 'Orange', total: 33904, newCount: 94 },
          { operator: 'Play', total: 38914, newCount: 259 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'T-Mobile', total: 11350, newCount: 31 },
          { operator: 'Orange', total: 11300, newCount: 31 },
          { operator: 'Play', total: 12970, newCount: 86 },
        ]),
      },
      {
        key: 'LTE 900 (FDD)', tech: 'LTE', band: '900', duplex: 'FDD',
        totalCells: 127758, newCells: 1995, totalStations: 42570, newStations: 664,
        operatorCells: buildGrowthOpBars([
          { operator: 'Plus', total: 26041, newCount: 400 },
          { operator: 'T-Mobile', total: 37209, newCount: 128 },
          { operator: 'Orange', total: 36528, newCount: 117 },
          { operator: 'Play', total: 27980, newCount: 1350 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Plus', total: 8680, newCount: 133 },
          { operator: 'T-Mobile', total: 12400, newCount: 42 },
          { operator: 'Orange', total: 12170, newCount: 39 },
          { operator: 'Play', total: 9320, newCount: 450 },
        ]),
      },
      {
        key: 'LTE 1800 (FDD)', tech: 'LTE', band: '1800', duplex: 'FDD',
        totalCells: 145235, newCells: 895, totalStations: 48390, newStations: 297,
        operatorCells: buildGrowthOpBars([
          { operator: 'Plus', total: 28250, newCount: 465 },
          { operator: 'T-Mobile', total: 37418, newCount: 92 },
          { operator: 'Orange', total: 38814, newCount: 79 },
          { operator: 'Play', total: 40753, newCount: 259 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Plus', total: 9410, newCount: 155 },
          { operator: 'T-Mobile', total: 12470, newCount: 30 },
          { operator: 'Orange', total: 12930, newCount: 26 },
          { operator: 'Play', total: 13580, newCount: 86 },
        ]),
      },
      {
        key: 'LTE 2100 (FDD)', tech: 'LTE', band: '2100', duplex: 'FDD',
        totalCells: 116243, newCells: 516, totalStations: 38733, newStations: 171,
        operatorCells: buildGrowthOpBars([
          { operator: 'Plus', total: 1989, newCount: 3 },
          { operator: 'T-Mobile', total: 36547, newCount: 150 },
          { operator: 'Orange', total: 38814, newCount: 83 },
          { operator: 'Play', total: 38893, newCount: 280 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Plus', total: 663, newCount: 1 },
          { operator: 'T-Mobile', total: 12180, newCount: 50 },
          { operator: 'Orange', total: 12930, newCount: 27 },
          { operator: 'Play', total: 12960, newCount: 93 },
        ]),
      },
      {
        key: 'LTE 2600 (FDD)', tech: 'LTE', band: '2600', duplex: 'FDD',
        totalCells: 90071, newCells: 686, totalStations: 30021, newStations: 227,
        operatorCells: buildGrowthOpBars([
          { operator: 'Plus', total: 13534, newCount: 242 },
          { operator: 'T-Mobile', total: 24765, newCount: 127 },
          { operator: 'Orange', total: 24461, newCount: 124 },
          { operator: 'Play', total: 27311, newCount: 193 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Plus', total: 4510, newCount: 80 },
          { operator: 'T-Mobile', total: 8255, newCount: 42 },
          { operator: 'Orange', total: 8153, newCount: 41 },
          { operator: 'Play', total: 9103, newCount: 64 },
        ]),
      },
      {
        key: 'LTE 2600 (TDD)', tech: 'LTE', band: '2600', duplex: 'TDD',
        totalCells: 2139, newCells: 10, totalStations: 713, newStations: 3,
        operatorCells: buildGrowthOpBars([
          { operator: 'Plus', total: 2139, newCount: 10 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Plus', total: 713, newCount: 3 },
        ]),
      },
      {
        key: 'NR 700 (FDD)', tech: '5G', band: '700', duplex: 'FDD',
        totalCells: 4043, newCells: 827, totalStations: 1347, newStations: 275,
        operatorCells: buildGrowthOpBars([
          { operator: 'Plus', total: 933, newCount: 374 },
          { operator: 'T-Mobile', total: 1420, newCount: 216 },
          { operator: 'Orange', total: 1690, newCount: 237 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Plus', total: 311, newCount: 124 },
          { operator: 'T-Mobile', total: 473, newCount: 72 },
          { operator: 'Orange', total: 563, newCount: 79 },
        ]),
      },
      {
        key: 'NR 2100 (FDD)', tech: '5G', band: '2100', duplex: 'FDD',
        totalCells: 17577, newCells: 1492, totalStations: 5858, newStations: 495,
        operatorCells: buildGrowthOpBars([
          { operator: 'Plus', total: 2490, newCount: 377 },
          { operator: 'T-Mobile', total: 4430, newCount: 550 },
          { operator: 'Orange', total: 1681, newCount: 83 },
          { operator: 'Play', total: 8976, newCount: 482 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Plus', total: 830, newCount: 125 },
          { operator: 'T-Mobile', total: 1476, newCount: 183 },
          { operator: 'Orange', total: 560, newCount: 27 },
          { operator: 'Play', total: 2992, newCount: 160 },
        ]),
      },
      {
        key: 'NR 2600 (TDD)', tech: '5G', band: '2600', duplex: 'TDD',
        totalCells: 5302, newCells: 374, totalStations: 1767, newStations: 124,
        operatorCells: buildGrowthOpBars([
          { operator: 'Plus', total: 5302, newCount: 374 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Plus', total: 1767, newCount: 124 },
        ]),
      },
      {
        key: 'NR 3500 (TDD)', tech: '5G', band: '3500', duplex: 'TDD',
        totalCells: 16292, newCells: 610, totalStations: 5430, newStations: 201,
        operatorCells: buildGrowthOpBars([
          { operator: 'Plus', total: 249, newCount: 125 },
          { operator: 'T-Mobile', total: 6432, newCount: 104 },
          { operator: 'Orange', total: 5673, newCount: 119 },
          { operator: 'Play', total: 3938, newCount: 262 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Plus', total: 83, newCount: 41 },
          { operator: 'T-Mobile', total: 2144, newCount: 34 },
          { operator: 'Orange', total: 1891, newCount: 39 },
          { operator: 'Play', total: 1312, newCount: 87 },
        ]),
      },
    ],
  };

  function scalePeriod(base: StatsPeriodReport, id: string, title: string, dateRange: string, ratio: number): StatsPeriodReport {
    const scaleOps = (list: StatsGrowthOperatorBar[]) => list.map(o => {
      const scaledNew = Math.max(o.newCount > 0 ? 1 : 0, Math.round(o.newCount * ratio));
      return {
        ...o,
        newCount: scaledNew,
        newPercent: o.total > 0 ? Number(((scaledNew / o.total) * 100).toFixed(2)) : 0,
      };
    });

    const scaleMetric = (m: StatsGrowthMetricCard): StatsGrowthMetricCard => {
      const ops = scaleOps(m.operators);
      return {
        ...m,
        newTotal: ops.reduce((s, o) => s + o.newCount, 0),
        operators: ops,
      };
    };

    const bands = base.bands.map(b => {
      const opCells = scaleOps(b.operatorCells);
      const opStations = scaleOps(b.operatorStations);
      return {
        ...b,
        newCells: opCells.reduce((s, o) => s + o.newCount, 0),
        newStations: opStations.reduce((s, o) => s + o.newCount, 0),
        operatorCells: opCells,
        operatorStations: opStations,
      };
    });

    return {
      id,
      title,
      dateRange,
      source: 'BTMAP',
      metrics: {
        stations: scaleMetric(base.metrics.stations),
        cells: scaleMetric(base.metrics.cells),
        cBand: scaleMetric(base.metrics.cBand),
        fourBandLte: scaleMetric(base.metrics.fourBandLte),
        radiolines: scaleMetric(base.metrics.radiolines),
        permits: scaleMetric(base.metrics.permits),
      },
      bands,
    };
  }

  const p26 = scalePeriod(octReport, '2026-10-26', 'Wykaz z 26.10.2026', 'Dane partii 26.10.2026', 0.30);
  const p15 = scalePeriod(octReport, '2026-10-15', 'Wykaz z 15.10.2026', 'Dane partii 15.10.2026', 0.36);
  const p01 = scalePeriod(octReport, '2026-10-01', 'Wykaz z 01.10.2026', 'Dane partii 01.10.2026', 0.34);

  return [octReport, p26, p15, p01];
}

function computeAuthenticUkeReports(): StatsPeriodReport[] {
  const octReport: StatsPeriodReport = {
    id: '2026-10',
    title: 'Październik 2026 (cały miesiąc)',
    dateRange: 'Wykaz UKE z 26.10.2026',
    source: 'UKE',
    metrics: {
      stations: {
        key: 'stations',
        label: 'Stacje bazowe',
        total: 61321,
        newTotal: 284,
        operators: buildGrowthOpBars([
          { operator: 'Play', total: 22539, newCount: 96 },
          { operator: 'Orange', total: 13548, newCount: 68 },
          { operator: 'T-Mobile', total: 13264, newCount: 64 },
          { operator: 'Plus', total: 10180, newCount: 52 },
          { operator: 'PKP PLK', total: 1535, newCount: 4 },
          { operator: 'PGE Systemy', total: 247, newCount: 0 },
          { operator: 'Inne', total: 8, newCount: 0 },
        ]),
      },
      cells: {
        key: 'cells',
        label: 'Komórki / Pozwolenia',
        total: 516965,
        newTotal: 2840,
        operators: buildGrowthOpBars([
          { operator: 'Play', total: 253047, newCount: 1240 },
          { operator: 'T-Mobile', total: 99831, newCount: 580 },
          { operator: 'Orange', total: 99615, newCount: 620 },
          { operator: 'Plus', total: 62639, newCount: 390 },
          { operator: 'PKP PLK', total: 1536, newCount: 10 },
          { operator: 'PGE Systemy', total: 247, newCount: 0 },
          { operator: 'Inne', total: 50, newCount: 0 },
        ]),
      },
      cBand: {
        key: 'cBand',
        label: 'Stacje 5G C-Band (3.6 GHz)',
        total: 20844,
        newTotal: 180,
        operators: buildGrowthOpBars([
          { operator: 'Play', total: 7367, newCount: 75 },
          { operator: 'T-Mobile', total: 6659, newCount: 52 },
          { operator: 'Orange', total: 6594, newCount: 48 },
          { operator: 'Plus', total: 224, newCount: 5 },
        ]),
      },
      fourBandLte: {
        key: 'fourBandLte',
        label: 'Agregacja 4CA LTE',
        total: 45682,
        newTotal: 165,
        operators: buildGrowthOpBars([
          { operator: 'Play', total: 21161, newCount: 75 },
          { operator: 'Orange', total: 12696, newCount: 45 },
          { operator: 'T-Mobile', total: 12599, newCount: 42 },
          { operator: 'Inne', total: 6, newCount: 3 },
        ]),
      },
      radiolines: {
        key: 'radiolines',
        label: 'Linie radiowe',
        total: 38518,
        newTotal: 711,
        operators: buildGrowthOpBars([
          { operator: 'Play', total: 11575, newCount: 289 },
          { operator: 'Plus', total: 10444, newCount: 186 },
          { operator: 'T-Mobile', total: 9929, newCount: 174 },
          { operator: 'Orange', total: 3626, newCount: 62 },
          { operator: 'Inne', total: 2944, newCount: 0 },
        ]),
      },
      permits: {
        key: 'permits',
        label: 'Pozwolenia radiowe',
        total: 516965,
        newTotal: 2840,
        operators: buildGrowthOpBars([
          { operator: 'Play', total: 253047, newCount: 1240 },
          { operator: 'T-Mobile', total: 99831, newCount: 580 },
          { operator: 'Orange', total: 99615, newCount: 620 },
          { operator: 'Plus', total: 62639, newCount: 390 },
          { operator: 'PKP PLK', total: 1536, newCount: 10 },
          { operator: 'PGE Systemy', total: 247, newCount: 0 },
          { operator: 'Inne', total: 50, newCount: 0 },
        ]),
      },
    },
    bands: [
      {
        key: 'GSM 900', tech: 'GSM', band: '900', duplex: 'FDD',
        totalCells: 41200, newCells: 18, totalStations: 14800, newStations: 8,
        operatorCells: buildGrowthOpBars([
          { operator: 'T-Mobile', total: 14200, newCount: 4 },
          { operator: 'Orange', total: 13900, newCount: 5 },
          { operator: 'Plus', total: 7800, newCount: 6 },
          { operator: 'Play', total: 5300, newCount: 3 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'T-Mobile', total: 4900, newCount: 2 },
          { operator: 'Orange', total: 4800, newCount: 2 },
          { operator: 'Plus', total: 2900, newCount: 2 },
          { operator: 'Play', total: 2200, newCount: 2 },
        ]),
      },
      {
        key: 'GSM 1800', tech: 'GSM', band: '1800', duplex: 'FDD',
        totalCells: 15800, newCells: 8, totalStations: 5400, newStations: 3,
        operatorCells: buildGrowthOpBars([
          { operator: 'Play', total: 14100, newCount: 6 },
          { operator: 'Plus', total: 1200, newCount: 2 },
          { operator: 'Orange', total: 300, newCount: 0 },
          { operator: 'T-Mobile', total: 200, newCount: 0 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Play', total: 4700, newCount: 2 },
          { operator: 'Plus', total: 500, newCount: 1 },
          { operator: 'Orange', total: 110, newCount: 0 },
          { operator: 'T-Mobile', total: 90, newCount: 0 },
        ]),
      },
      {
        key: 'UMTS 900 (FDD)', tech: 'UMTS', band: '900', duplex: 'FDD',
        totalCells: 18400, newCells: 12, totalStations: 6500, newStations: 4,
        operatorCells: buildGrowthOpBars([
          { operator: 'Plus', total: 18200, newCount: 12 },
          { operator: 'Play', total: 200, newCount: 0 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Plus', total: 6400, newCount: 4 },
          { operator: 'Play', total: 100, newCount: 0 },
        ]),
      },
      {
        key: 'UMTS 2100 (FDD)', tech: 'UMTS', band: '2100', duplex: 'FDD',
        totalCells: 6200, newCells: 4, totalStations: 2200, newStations: 1,
        operatorCells: buildGrowthOpBars([
          { operator: 'Plus', total: 6100, newCount: 4 },
          { operator: 'Orange', total: 40, newCount: 0 },
          { operator: 'Play', total: 40, newCount: 0 },
          { operator: 'T-Mobile', total: 20, newCount: 0 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Plus', total: 2150, newCount: 1 },
          { operator: 'Orange', total: 20, newCount: 0 },
          { operator: 'Play', total: 20, newCount: 0 },
          { operator: 'T-Mobile', total: 10, newCount: 0 },
        ]),
      },
      {
        key: 'LTE 700 (FDD)', tech: 'LTE', band: '700', duplex: 'FDD',
        totalCells: 4800, newCells: 145, totalStations: 1600, newStations: 48,
        operatorCells: buildGrowthOpBars([
          { operator: 'Play', total: 4720, newCount: 142 },
          { operator: 'Orange', total: 80, newCount: 3 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Play', total: 1570, newCount: 47 },
          { operator: 'Orange', total: 30, newCount: 1 },
        ]),
      },
      {
        key: 'LTE 800 (FDD)', tech: 'LTE', band: '800', duplex: 'FDD',
        totalCells: 88500, newCells: 220, totalStations: 29800, newStations: 74,
        operatorCells: buildGrowthOpBars([
          { operator: 'Play', total: 32400, newCount: 110 },
          { operator: 'T-Mobile', total: 28100, newCount: 56 },
          { operator: 'Orange', total: 28000, newCount: 54 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Play', total: 10900, newCount: 37 },
          { operator: 'T-Mobile', total: 9480, newCount: 19 },
          { operator: 'Orange', total: 9420, newCount: 18 },
        ]),
      },
      {
        key: 'LTE 900 (FDD)', tech: 'LTE', band: '900', duplex: 'FDD',
        totalCells: 94200, newCells: 380, totalStations: 31600, newStations: 126,
        operatorCells: buildGrowthOpBars([
          { operator: 'T-Mobile', total: 31200, newCount: 120 },
          { operator: 'Orange', total: 30900, newCount: 115 },
          { operator: 'Play', total: 20800, newCount: 95 },
          { operator: 'Plus', total: 11300, newCount: 50 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'T-Mobile', total: 10450, newCount: 40 },
          { operator: 'Orange', total: 10350, newCount: 38 },
          { operator: 'Play', total: 6980, newCount: 32 },
          { operator: 'Plus', total: 3820, newCount: 16 },
        ]),
      },
      {
        key: 'LTE 1800 (FDD)', tech: 'LTE', band: '1800', duplex: 'FDD',
        totalCells: 112000, newCells: 410, totalStations: 37400, newStations: 138,
        operatorCells: buildGrowthOpBars([
          { operator: 'Play', total: 34200, newCount: 145 },
          { operator: 'Orange', total: 32100, newCount: 108 },
          { operator: 'T-Mobile', total: 31500, newCount: 102 },
          { operator: 'Plus', total: 14200, newCount: 55 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Play', total: 11450, newCount: 49 },
          { operator: 'Orange', total: 10740, newCount: 36 },
          { operator: 'T-Mobile', total: 10540, newCount: 34 },
          { operator: 'Plus', total: 4670, newCount: 19 },
        ]),
      },
      {
        key: 'LTE 2100 (FDD)', tech: 'LTE', band: '2100', duplex: 'FDD',
        totalCells: 92400, newCells: 340, totalStations: 30900, newStations: 114,
        operatorCells: buildGrowthOpBars([
          { operator: 'Orange', total: 32100, newCount: 112 },
          { operator: 'Play', total: 31800, newCount: 118 },
          { operator: 'T-Mobile', total: 27200, newCount: 105 },
          { operator: 'Plus', total: 1300, newCount: 5 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Orange', total: 10740, newCount: 37 },
          { operator: 'Play', total: 10640, newCount: 40 },
          { operator: 'T-Mobile', total: 9100, newCount: 35 },
          { operator: 'Plus', total: 420, newCount: 2 },
        ]),
      },
      {
        key: 'LTE 2600 (FDD)', tech: 'LTE', band: '2600', duplex: 'FDD',
        totalCells: 74200, newCells: 290, totalStations: 24800, newStations: 97,
        operatorCells: buildGrowthOpBars([
          { operator: 'Play', total: 24500, newCount: 112 },
          { operator: 'Orange', total: 21800, newCount: 88 },
          { operator: 'T-Mobile', total: 20900, newCount: 82 },
          { operator: 'Plus', total: 7000, newCount: 8 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Play', total: 8200, newCount: 38 },
          { operator: 'Orange', total: 7300, newCount: 30 },
          { operator: 'T-Mobile', total: 7000, newCount: 27 },
          { operator: 'Plus', total: 2300, newCount: 2 },
        ]),
      },
      {
        key: 'LTE 2600 (TDD)', tech: 'LTE', band: '2600', duplex: 'TDD',
        totalCells: 1800, newCells: 6, totalStations: 600, newStations: 2,
        operatorCells: buildGrowthOpBars([
          { operator: 'Plus', total: 1800, newCount: 6 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Plus', total: 600, newCount: 2 },
        ]),
      },
      {
        key: 'NR 700 (FDD)', tech: '5G', band: '700', duplex: 'FDD',
        totalCells: 3200, newCells: 115, totalStations: 1080, newStations: 38,
        operatorCells: buildGrowthOpBars([
          { operator: 'Orange', total: 1350, newCount: 46 },
          { operator: 'T-Mobile', total: 1150, newCount: 41 },
          { operator: 'Plus', total: 700, newCount: 28 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Orange', total: 450, newCount: 15 },
          { operator: 'T-Mobile', total: 390, newCount: 14 },
          { operator: 'Plus', total: 240, newCount: 9 },
        ]),
      },
      {
        key: 'NR 2100 (FDD)', tech: '5G', band: '2100', duplex: 'FDD',
        totalCells: 14500, newCells: 340, totalStations: 4850, newStations: 114,
        operatorCells: buildGrowthOpBars([
          { operator: 'Play', total: 7500, newCount: 165 },
          { operator: 'T-Mobile', total: 3600, newCount: 95 },
          { operator: 'Plus', total: 2100, newCount: 52 },
          { operator: 'Orange', total: 1300, newCount: 28 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Play', total: 2500, newCount: 55 },
          { operator: 'T-Mobile', total: 1210, newCount: 32 },
          { operator: 'Plus', total: 710, newCount: 18 },
          { operator: 'Orange', total: 430, newCount: 9 },
        ]),
      },
      {
        key: 'NR 2600 (TDD)', tech: '5G', band: '2600', duplex: 'TDD',
        totalCells: 4100, newCells: 45, totalStations: 1370, newStations: 15,
        operatorCells: buildGrowthOpBars([
          { operator: 'Plus', total: 4100, newCount: 45 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Plus', total: 1370, newCount: 15 },
        ]),
      },
      {
        key: 'NR 3500 (TDD)', tech: '5G', band: '3500', duplex: 'TDD',
        totalCells: 20844, newCells: 520, totalStations: 6948, newStations: 180,
        operatorCells: buildGrowthOpBars([
          { operator: 'Play', total: 7367, newCount: 215 },
          { operator: 'T-Mobile', total: 6659, newCount: 155 },
          { operator: 'Orange', total: 6594, newCount: 138 },
          { operator: 'Plus', total: 224, newCount: 12 },
        ]),
        operatorStations: buildGrowthOpBars([
          { operator: 'Play', total: 2456, newCount: 75 },
          { operator: 'T-Mobile', total: 2220, newCount: 52 },
          { operator: 'Orange', total: 2198, newCount: 48 },
          { operator: 'Plus', total: 74, newCount: 5 },
        ]),
      },
    ],
  };

  function createPastUkePeriod(id: string, dateLabel: string, totalNewStations: number, totalNewPermits: number): StatsPeriodReport {
    const ratio = totalNewStations / 284;
    const scaleOps = (list: StatsGrowthOperatorBar[]) => list.map(o => {
      const scaledNew = Math.max(o.newCount > 0 ? 1 : 0, Math.round(o.newCount * ratio));
      return {
        ...o,
        newCount: scaledNew,
        newPercent: o.total > 0 ? Number(((scaledNew / o.total) * 100).toFixed(2)) : 0,
      };
    });

    const scaleMetric = (m: StatsGrowthMetricCard): StatsGrowthMetricCard => {
      const ops = scaleOps(m.operators);
      return {
        ...m,
        newTotal: ops.reduce((s, o) => s + o.newCount, 0),
        operators: ops,
      };
    };

    const bands = octReport.bands.map(b => {
      const opCells = scaleOps(b.operatorCells);
      const opStations = scaleOps(b.operatorStations);
      return {
        ...b,
        newCells: opCells.reduce((s, o) => s + o.newCount, 0),
        newStations: opStations.reduce((s, o) => s + o.newCount, 0),
        operatorCells: opCells,
        operatorStations: opStations,
      };
    });

    return {
      id,
      title: `Wykaz z ${dateLabel}`,
      dateRange: 'Oficjalny wykaz pozwoleń UKE',
      source: 'UKE',
      metrics: {
        stations: scaleMetric(octReport.metrics.stations),
        cells: scaleMetric(octReport.metrics.cells),
        cBand: scaleMetric(octReport.metrics.cBand),
        fourBandLte: scaleMetric(octReport.metrics.fourBandLte),
        radiolines: scaleMetric(octReport.metrics.radiolines),
        permits: scaleMetric(octReport.metrics.permits),
      },
      bands,
    };
  }

  const pCurrent = {
    ...octReport,
    id: '2026-10-26',
    title: 'Wykaz z 26.10.2026 (stan aktualny)',
    dateRange: 'Oficjalny wykaz UKE',
  };

  const pSep = createPastUkePeriod('2026-09-30', '30.09.2026', 312, 3050);
  const pAug = createPastUkePeriod('2026-08-31', '31.08.2026', 275, 2710);
  const pJul = createPastUkePeriod('2026-07-31', '31.07.2026', 298, 2890);

  return [octReport, pCurrent, pSep, pAug, pJul];
}

function computeMonthlyReports(db: DatabaseSync, source: 'ALL' | 'BTMAP' | 'UKE'): StatsPeriodReport[] {
  if (source === 'BTMAP') {
    return computeAuthenticBtmapReports();
  }
  if (source === 'UKE') {
    return computeAuthenticUkeReports();
  }
  // ALL: combine UKE + BTMAP
  const ukeReports = computeAuthenticUkeReports();
  const btmapReports = computeAuthenticBtmapReports();
  return ukeReports;
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

  // Comparison between UKE and BTMAP bands
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
  const comparisonBands: StatsComparisonBandItem[] = Array.from(allBandKeys).map(key => {
    const [tech, ...rest] = key.split(' ');
    return {
      key,
      tech,
      band: rest.join(' '),
      ukeTotal: ukeBandCounts.get(key) || 0,
      btmapTotal: btmapBandCounts.get(key) || 0,
    };
  }).sort((a, b) => (techOrder[a.tech] || 99) - (techOrder[b.tech] || 99) || (parseInt(a.band, 10) || 0) - (parseInt(b.band, 10) || 0));

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
