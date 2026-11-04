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

function computeMonthlyReports(db: DatabaseSync, source: 'ALL' | 'BTMAP' | 'UKE'): StatsPeriodReport[] {
  const whereClause =
    source === 'UKE'
      ? "WHERE status='APPROVED' AND source='UKE'"
      : source === 'BTMAP'
      ? "WHERE status='APPROVED' AND source!='UKE'"
      : "WHERE status='APPROVED'";

  const rows = db.prepare(
    `SELECT id, operators, createdAt FROM towers ${whereClause}`
  ).all() as Array<{ id: number; operators: string; createdAt?: string }>;

  // Find distinct dates
  const rawDates = Array.from(new Set(rows.map(r => r.createdAt ? r.createdAt.slice(0, 10) : '2026-10-10'))).sort();
  const octDates = rawDates.filter(d => d.startsWith('2026-10'));
  const minDate = rawDates[0] || '2026-10-10';

  const periods: Array<{
    id: string;
    title: string;
    dateRange: string;
    filter: (d: string) => boolean;
  }> = [];

  // Monthly summary (e.g. October 2026)
  if (octDates.length > 0) {
    periods.push({
      id: '2026-10',
      title: 'Październik 2026 (cały miesiąc)',
      dateRange: 'Dane od 2026-10-01 do 2026-10-31',
      filter: (d: string) => d.startsWith('2026-10') && d !== minDate,
    });
  }

  // Individual update batches (newest first)
  const batchDatesDesc = [...rawDates].reverse();
  for (const bDate of batchDatesDesc) {
    const parts = bDate.split('-');
    const label = parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : bDate;
    periods.push({
      id: bDate,
      title: `Wykaz z ${label}`,
      dateRange: `Dane partii ${label}`,
      filter: (d: string) => d === bDate,
    });
  }

  if (periods.length === 0) {
    periods.push({
      id: 'all',
      title: 'Wszystkie dane',
      dateRange: 'Pełny zakres',
      filter: () => true,
    });
  }

  // Radiolines and photos for metric cards
  let rlRows: Array<{ operator: string; isNew: number }> = [];
  try {
    rlRows = db.prepare('SELECT operator, isNew FROM radiolines').all() as any;
  } catch {}

  let photoRows: Array<{ userNick?: string; createdAt?: string }> = [];
  try {
    photoRows = db.prepare('SELECT userNick, createdAt FROM photos').all() as any;
  } catch {}

  return periods.map(p => {
    const opStationMap = new Map<string, { operator: string; total: number; newCount: number; newPercent: number }>();
    const opCellMap = new Map<string, { operator: string; total: number; newCount: number; newPercent: number }>();
    const opPermitMap = new Map<string, { operator: string; total: number; newCount: number; newPercent: number }>();
    const opAzimuthMap = new Map<string, { operator: string; total: number; newCount: number; newPercent: number }>();

    const bandCardMap = new Map<string, {
      key: string;
      tech: string;
      band: string;
      duplex: 'FDD' | 'TDD';
      totalCells: number;
      newCells: number;
      totalStations: number;
      newStations: number;
      opCells: Map<string, { operator: string; total: number; newCount: number; newPercent: number }>;
      opStations: Map<string, { operator: string; total: number; newCount: number; newPercent: number }>;
    }>();

    for (const sb of STANDARD_GROWTH_BANDS) {
      bandCardMap.set(sb.key, {
        key: sb.key,
        tech: sb.tech,
        band: sb.band,
        duplex: sb.duplex,
        totalCells: 0,
        newCells: 0,
        totalStations: 0,
        newStations: 0,
        opCells: new Map(),
        opStations: new Map(),
      });
    }

    let totalStations = 0;
    let newStations = 0;
    let totalCells = 0;
    let newCells = 0;
    let totalPermits = 0;
    let newPermits = 0;
    let totalCBand = 0;
    let newCBand = 0;
    let totalFourBandLte = 0;
    let newFourBandLte = 0;

    const opCBandMap = new Map<string, { operator: string; total: number; newCount: number; newPercent: number }>();
    const opFourBandLteMap = new Map<string, { operator: string; total: number; newCount: number; newPercent: number }>();

    for (const r of rows) {
      totalStations++;
      const rDate = r.createdAt ? r.createdAt.slice(0, 10) : '';
      const isNew = p.filter(rDate);
      if (isNew) newStations++;

      let ops: any[] = [];
      try { ops = JSON.parse(r.operators); } catch {}
      if (!Array.isArray(ops)) continue;

      for (const op of ops) {
        const opName = (op.name || 'Inne').trim();

        // Operator station counts
        let sData = opStationMap.get(opName);
        if (!sData) {
          sData = { operator: opName, total: 0, newCount: 0, newPercent: 0 };
          opStationMap.set(opName, sData);
        }
        sData.total++;
        if (isNew) sData.newCount++;

        const bands = Array.isArray(op.bands) ? op.bands : (Array.isArray(op.cells) ? op.cells : []);
        totalCells += bands.length;
        totalPermits += bands.length;
        if (isNew) {
          newCells += bands.length;
          newPermits += bands.length;
        }

        // Operator cell counts
        let cData = opCellMap.get(opName);
        if (!cData) {
          cData = { operator: opName, total: 0, newCount: 0, newPercent: 0 };
          opCellMap.set(opName, cData);
        }
        cData.total += bands.length;
        if (isNew) cData.newCount += bands.length;

        // Operator permit counts
        let pmData = opPermitMap.get(opName);
        if (!pmData) {
          pmData = { operator: opName, total: 0, newCount: 0, newPercent: 0 };
          opPermitMap.set(opName, pmData);
        }
        pmData.total += bands.length;
        if (isNew) pmData.newCount += bands.length;

        const stationBands = new Set<string>();
        const opLteBands = new Set<string>();
        let opHasCBand = false;

        for (const b of bands) {
          let tech = String(b.tech || 'Inne').toUpperCase();
          if (tech === 'NR') tech = '5G';
          const bandNum = String(b.band || '').replace(/MHz/i, '').trim();
          if (!bandNum) continue;

          if (tech === '5G' && (bandNum === '3500' || bandNum === '3600')) {
            opHasCBand = true;
          }
          if (tech === 'LTE' && ['800', '1800', '2100', '2600'].includes(bandNum)) {
            opLteBands.add(bandNum);
          }

          // Standard band key lookup
          let card: any = null;
          if (tech === '5G' && (bandNum === '3500' || bandNum === '3600')) {
            card = bandCardMap.get('NR 3500 (TDD)');
          } else if (tech === '5G' && bandNum === '2600') {
            card = bandCardMap.get('NR 2600 (TDD)');
          } else if (tech === '5G' && bandNum === '2100') {
            card = bandCardMap.get('NR 2100 (FDD)');
          } else if (tech === '5G' && bandNum === '700') {
            card = bandCardMap.get('NR 700 (FDD)');
          } else if (tech === 'LTE' && bandNum === '2600' && (b.duplex === 'TDD' || b.bandKey?.includes('TDD'))) {
            card = bandCardMap.get('LTE 2600 (TDD)');
          } else if (tech === 'LTE' && bandNum === '2600') {
            card = bandCardMap.get('LTE 2600 (FDD)');
          } else if (tech === 'LTE' && bandNum === '2100') {
            card = bandCardMap.get('LTE 2100 (FDD)');
          } else if (tech === 'LTE' && bandNum === '1800') {
            card = bandCardMap.get('LTE 1800 (FDD)');
          } else if (tech === 'LTE' && bandNum === '900') {
            card = bandCardMap.get('LTE 900 (FDD)');
          } else if (tech === 'LTE' && bandNum === '800') {
            card = bandCardMap.get('LTE 800 (FDD)');
          } else if (tech === 'LTE' && bandNum === '700') {
            card = bandCardMap.get('LTE 700 (FDD)');
          } else if (tech === 'UMTS' && bandNum === '2100') {
            card = bandCardMap.get('UMTS 2100 (FDD)');
          } else if (tech === 'UMTS' && bandNum === '900') {
            card = bandCardMap.get('UMTS 900 (FDD)');
          } else if (tech === 'GSM' && bandNum === '1800') {
            card = bandCardMap.get('GSM 1800');
          } else if (tech === 'GSM' && bandNum === '900') {
            card = bandCardMap.get('GSM 900');
          }

          if (card) {
            card.totalCells++;
            if (isNew) card.newCells++;

            let opC = card.opCells.get(opName);
            if (!opC) {
              opC = { operator: opName, total: 0, newCount: 0, newPercent: 0 };
              card.opCells.set(opName, opC);
            }
            opC.total++;
            if (isNew) opC.newCount++;

            stationBands.add(card.key);
          }
        }

        if (opHasCBand) {
          totalCBand++;
          if (isNew) newCBand++;
          let entry = opCBandMap.get(opName);
          if (!entry) {
            entry = { operator: opName, total: 0, newCount: 0, newPercent: 0 };
            opCBandMap.set(opName, entry);
          }
          entry.total++;
          if (isNew) entry.newCount++;
        }

        if (opLteBands.size >= 4) {
          totalFourBandLte++;
          if (isNew) newFourBandLte++;
          let entry = opFourBandLteMap.get(opName);
          if (!entry) {
            entry = { operator: opName, total: 0, newCount: 0, newPercent: 0 };
            opFourBandLteMap.set(opName, entry);
          }
          entry.total++;
          if (isNew) entry.newCount++;
        }

        for (const bKey of stationBands) {
          const card = bandCardMap.get(bKey);
          if (card) {
            card.totalStations++;
            if (isNew) card.newStations++;

            let opS = card.opStations.get(opName);
            if (!opS) {
              opS = { operator: opName, total: 0, newCount: 0, newPercent: 0 };
              card.opStations.set(opName, opS);
            }
            opS.total++;
            if (isNew) opS.newCount++;
          }
        }
      }
    }

    const calcPercents = (map: Map<string, { operator: string; total: number; newCount: number; newPercent: number }>) => {
      const arr = Array.from(map.values()).sort((a, b) => b.total - a.total);
      for (const item of arr) {
        item.newPercent = item.total > 0 ? Number(((item.newCount / item.total) * 100).toFixed(1)) : 0;
      }
      return arr;
    };

    const opStationsList = calcPercents(opStationMap);
    const opCellsList = calcPercents(opCellMap);
    const opCBandList = calcPercents(opCBandMap);
    const opFourBandLteList = calcPercents(opFourBandLteMap);
    const opPermitsList = calcPercents(opPermitMap);

    // Radiolines
    const rlOpMap = new Map<string, { operator: string; total: number; newCount: number; newPercent: number }>();
    let totalRl = 0;
    let newRl = 0;
    for (const rl of rlRows) {
      totalRl++;
      const op = rl.operator || 'Inne';
      let entry = rlOpMap.get(op);
      if (!entry) {
        entry = { operator: op, total: 0, newCount: 0, newPercent: 0 };
        rlOpMap.set(op, entry);
      }
      entry.total++;
      if (rl.isNew) {
        entry.newCount++;
        newRl++;
      }
    }
    const rlOpList = calcPercents(rlOpMap);

    // Photos
    const photoOpMap = new Map<string, { operator: string; total: number; newCount: number; newPercent: number }>();
    let totalPhotos = 0;
    let newPhotos = 0;
    for (const ph of photoRows) {
      totalPhotos++;
      const isNewPhoto = ph.createdAt && p.filter(ph.createdAt.slice(0, 10));
      if (isNewPhoto) newPhotos++;
      const op = 'Społeczność BTMap';
      let entry = photoOpMap.get(op);
      if (!entry) {
        entry = { operator: op, total: 0, newCount: 0, newPercent: 0 };
        photoOpMap.set(op, entry);
      }
      entry.total++;
      if (isNewPhoto) entry.newCount++;
    }
    const photoOpList = calcPercents(photoOpMap);

    const bandsList: StatsGrowthBandCard[] = Array.from(bandCardMap.values()).map(card => {
      const opCells = calcPercents(card.opCells);
      const opStations = calcPercents(card.opStations);
      return {
        key: card.key,
        tech: card.tech,
        band: card.band,
        duplex: card.duplex,
        totalCells: card.totalCells,
        newCells: card.newCells,
        totalStations: card.totalStations,
        newStations: card.newStations,
        operatorCells: opCells,
        operatorStations: opStations,
      };
    });

    return {
      id: p.id,
      title: p.title,
      dateRange: p.dateRange,
      source,
      metrics: {
        stations: {
          key: 'stations',
          label: 'Stacje bazowe',
          total: totalStations,
          newTotal: newStations,
          operators: opStationsList,
        },
        cells: {
          key: 'cells',
          label: 'Komórki / Sektory',
          total: totalCells,
          newTotal: newCells,
          operators: opCellsList,
        },
        cBand: {
          key: 'cBand',
          label: 'Stacje 5G C-Band (3.6 GHz)',
          total: totalCBand,
          newTotal: newCBand,
          operators: opCBandList,
        },
        fourBandLte: {
          key: 'fourBandLte',
          label: 'Agregacja 4CA LTE',
          total: totalFourBandLte,
          newTotal: newFourBandLte,
          operators: opFourBandLteList,
        },
        radiolines: {
          key: 'radiolines',
          label: 'Linie radiowe',
          total: totalRl,
          newTotal: newRl,
          operators: rlOpList,
        },
        permits: {
          key: 'permits',
          label: 'Pozwolenia radiowe',
          total: totalPermits,
          newTotal: newPermits,
          operators: opPermitsList,
        },
      },
      bands: bandsList,
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
      totalCells += cells.length;

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

  // Timeline of new stations added
  const timelineMap = new Map<string, {
    total: number;
    ops: Map<string, number>;
    bands: Map<string, number>;
  }>();

  for (const row of rows) {
    const rawDate = row.createdAt ? row.createdAt.slice(0, 10) : 'Wcześniejsze';
    let tEntry = timelineMap.get(rawDate);
    if (!tEntry) {
      tEntry = { total: 0, ops: new Map(), bands: new Map() };
      timelineMap.set(rawDate, tEntry);
    }
    tEntry.total++;

    let ops: any[] = [];
    try { ops = JSON.parse(row.operators); } catch {}
    if (Array.isArray(ops)) {
      for (const op of ops) {
        const opName = (op.name || 'Inne').trim();
        tEntry.ops.set(opName, (tEntry.ops.get(opName) || 0) + 1);

        const bList = Array.isArray(op.bands) ? op.bands : (Array.isArray(op.cells) ? op.cells : []);
        for (const b of bList) {
          let tech = String(b.tech || 'Inne').toUpperCase();
          if (tech === 'NR') tech = '5G';
          const bandNum = String(b.band || '').replace(/MHz/i, '').trim();
          if (bandNum) {
            const bKey = `${tech} ${bandNum}`;
            tEntry.bands.set(bKey, (tEntry.bands.get(bKey) || 0) + 1);
          }
        }
      }
    }
  }

  const monthNamesPl = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  const formatTimelineLabel = (d: string) => {
    if (d === 'Wcześniejsze') return 'Wcześniejsze';
    const parts = d.split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[2], 10);
      const mIdx = parseInt(parts[1], 10) - 1;
      const year = parts[0];
      return `${day} ${monthNamesPl[mIdx] || parts[1]} ${year}`;
    }
    return d;
  };

  const timeline: StatsTimelineItem[] = Array.from(timelineMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, data]) => ({
      period,
      label: formatTimelineLabel(period),
      totalNew: data.total,
      operators: Array.from(data.ops.entries())
        .map(([operator, count]) => ({ operator, count }))
        .sort((a, b) => b.count - a.count),
      topBands: Array.from(data.bands.entries())
        .map(([band, count]) => ({ band, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
    }));

  const latestTimeline = timeline.length > 0 ? timeline[timeline.length - 1] : null;
  const latestNewTowers = latestTimeline?.totalNew || 0;
  const latestNewDate = latestTimeline?.period || null;

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
