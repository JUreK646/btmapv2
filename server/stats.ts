import type { DatabaseSync } from 'node:sqlite';

export interface StatsOperatorItem {
  name: string;
  towers: number;
  permits: number;
  percent: number;
}

export interface StatsTechItem {
  tech: string;
  towers: number;
  permits: number;
  percent: number;
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

export interface TelecomStats {
  source: 'ALL' | 'BTMAP' | 'UKE';
  summary: {
    totalTowers: number;
    totalPermits: number;
    totalCells: number;
  };
  technologies: StatsTechItem[];
  operators: StatsOperatorItem[];
  bands: StatsBandItem[];
  provinces: StatsProvinceItem[];
  updatedAt: string;
}

const cache = new Map<string, { at: number; data: TelecomStats }>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

export function invalidateStatsCache() {
  cache.clear();
}

export function getTelecomStats(db: DatabaseSync, rawSource?: string): TelecomStats {
  const source = rawSource === 'BTMAP' ? 'BTMAP' : rawSource === 'UKE' ? 'UKE' : 'ALL';
  const cached = cache.get(source);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const sql = source === 'ALL'
    ? "SELECT id, province, operators, source FROM towers WHERE status='APPROVED'"
    : "SELECT id, province, operators, source FROM towers WHERE status='APPROVED' AND source=?";
  
  const rows = source === 'ALL'
    ? db.prepare(sql).all() as { id: string; province: string | null; operators: string; source: string }[]
    : db.prepare(sql).all(source) as { id: string; province: string | null; operators: string; source: string }[];

  const totalTowers = rows.length;
  let totalPermits = 0;
  let totalCells = 0;

  const techTowerSets = new Map<string, Set<string>>();
  const techPermits = new Map<string, number>();
  const opTowerSets = new Map<string, Set<string>>();
  const opPermits = new Map<string, number>();
  const bandTowerSets = new Map<string, Map<string, Set<string>>>();
  const provTowerSets = new Map<string, Map<string, Set<string>>>();

  for (const row of rows) {
    const id = row.id;
    const prov = (row.province || '').trim();
    let ops: any[] = [];
    try {
      ops = JSON.parse(row.operators);
    } catch {
      continue;
    }
    if (!Array.isArray(ops)) continue;

    for (const op of ops) {
      const opName = (op.name || 'Inny').trim();
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

      if (bands.length === 0 && cells.length > 0) {
        // Derive bands from cell data if bands array is empty (e.g. BTMAP stations)
        for (const c of cells) {
          totalPermits++;
          let tech = String(c.tech || 'Inne').toUpperCase();
          if (tech === 'NR') tech = '5G';
          const bandNum = String(c.band || '').replace(/MHz/i, '').trim();
          const bandKey = `${tech} ${bandNum}`;

          if (!techTowerSets.has(tech)) techTowerSets.set(tech, new Set());
          techTowerSets.get(tech)!.add(id);
          techPermits.set(tech, (techPermits.get(tech) || 0) + 1);
          opPermits.set(opName, (opPermits.get(opName) || 0) + 1);

          if (!bandTowerSets.has(bandKey)) bandTowerSets.set(bandKey, new Map());
          const bMap = bandTowerSets.get(bandKey)!;
          if (!bMap.has(opName)) bMap.set(opName, new Set());
          bMap.get(opName)!.add(id);
        }
      } else {
        for (const b of bands) {
          totalPermits++;
          let tech = String(b.tech || 'Inne').toUpperCase();
          if (tech === 'NR') tech = '5G';
          const bandNum = String(b.band || '').replace(/MHz/i, '').trim();
          const bandKey = `${tech} ${bandNum}`;

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
    }
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
      });
    }
  }
  for (const [tech, set] of techTowerSets) {
    if (!standardTechs.includes(tech)) {
      technologies.push({
        tech,
        towers: set.size,
        permits: techPermits.get(tech) || 0,
        percent: totalTowers > 0 ? Number(((set.size / totalTowers) * 100).toFixed(1)) : 0,
      });
    }
  }

  // Operators
  const operators: StatsOperatorItem[] = Array.from(opTowerSets.entries())
    .map(([name, set]) => ({
      name,
      towers: set.size,
      permits: opPermits.get(name) || 0,
      percent: totalTowers > 0 ? Number(((set.size / totalTowers) * 100).toFixed(1)) : 0,
    }))
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

  const result: TelecomStats = {
    source,
    summary: {
      totalTowers,
      totalPermits,
      totalCells,
    },
    technologies,
    operators,
    bands,
    provinces,
    updatedAt: new Date().toISOString(),
  };

  cache.set(source, { at: Date.now(), data: result });
  return result;
}
