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
  };
  technologies: StatsTechItem[];
  operators: StatsOperatorItem[];
  bands: StatsBandItem[];
  provinces: StatsProvinceItem[];
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
    ? "SELECT id, lat, lng, stationId, address, province, operators, source FROM towers WHERE status='APPROVED'"
    : "SELECT id, lat, lng, stationId, address, province, operators, source FROM towers WHERE status='APPROVED' AND source=?";

  type TowerRow = {
    id: string;
    lat: number;
    lng: number;
    stationId: string | null;
    address: string | null;
    province: string | null;
    operators: string;
    source: string;
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

  const result: TelecomStats = {
    source,
    summary: {
      totalTowers,
      totalPermits,
      totalCells,
      ukeTowers: ukeTowersTotal,
      btmapTowers: btmapTowersTotal,
    },
    technologies,
    operators,
    bands,
    provinces,
    radiolines,
    dataQuality,
    updatedAt: new Date().toISOString(),
  };

  cache.set(source, { at: Date.now(), data: result });
  return result;
}
