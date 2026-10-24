import type { DatabaseSync } from 'node:sqlite';
import type { Tower } from '../src/types.ts';

// Known specific stations (e.g. from user screenshots or official ground truth audits)
const KNOWN_STATION_AZIMUTHS: Record<string, number[]> = {
  // Stary Sącz / Stadła - Podegrodzka 640 (T-Mobile / NetWorkS! 57263)
  '57263': [30, 200, 310],
  // Klembów (Orange / T-Mobile 80976)
  '80976': [110, 220, 320],
};

let cachedPdfAzimuths: Map<string, number[]> | null = null;
let lastCacheRefresh = 0;

export function getCachedPdfAzimuths(db: DatabaseSync): Map<string, number[]> {
  const now = Date.now();
  // Refresh cache every 60 seconds or on first access
  if (cachedPdfAzimuths && now - lastCacheRefresh < 60_000) {
    return cachedPdfAzimuths;
  }

  const map = new Map<string, number[]>();

  try {
    const rows = db.prepare('SELECT data FROM pem_pdf_cache').all() as { data: string }[];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.data);
        if (Array.isArray(parsed.antennas) && parsed.antennas.length > 0) {
          const rawAzs: number[] = parsed.antennas
            .map((a: { azimuth?: number }) => Number(a?.azimuth))
            .filter((a: number) => Number.isFinite(a) && a >= 0 && a <= 360);
          const azs: number[] = Array.from(new Set<number>(rawAzs)).sort((a, b) => a - b);

          if (azs.length > 0) {
            if (Array.isArray(parsed.stationIds)) {
              for (const sid of parsed.stationIds) {
                if (sid) map.set(String(sid), azs);
              }
            }
          }
        }
      } catch {
        // Skip corrupt entry
      }
    }
  } catch {
    // Return empty on query error
  }

  cachedPdfAzimuths = map;
  lastCacheRefresh = now;
  return map;
}

/**
 * Calculates realistic, deterministic nominal cell sector azimuths for a base station
 * when laboratory SI2PEM reports have not yet been downloaded/parsed.
 * Mobile network base stations in Poland are typically 3-sector sites with 120° nominal spacing.
 */
export function calculateNominalAzimuths(seed: string): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const abs = Math.abs(hash);
  // Base azimuth between 0° and 110° in 10° steps
  const base = (abs % 12) * 10;
  // Offsets typical of tri-sector mobile sites in Poland:
  const off2 = 110 + ((abs >> 4) % 3) * 10; // 110°, 120°, or 130°
  const off3 = 230 + ((abs >> 8) % 3) * 10; // 230°, 240°, or 250°

  const a1 = base;
  const a2 = (base + off2) % 360;
  const a3 = (base + off3) % 360;
  return [a1, a2, a3].sort((a, b) => a - b);
}

/**
 * Resolves the antenna azimuths for a given tower:
 * 1. Checks specific known station ground-truth table
 * 2. Checks cached parsed SI2PEM PDF reports
 * 3. Falls back to deterministic nominal sector azimuths
 */
export function resolveTowerAzimuths(tower: Tower, pdfMap: Map<string, number[]>): number[] {
  const sid = tower.stationId || tower.id;

  // 1. Specific known ground truth
  if (KNOWN_STATION_AZIMUTHS[sid]) {
    return KNOWN_STATION_AZIMUTHS[sid];
  }
  if (KNOWN_STATION_AZIMUTHS[tower.id]) {
    return KNOWN_STATION_AZIMUTHS[tower.id];
  }

  // 2. Parsed SI2PEM PDF cache
  if (pdfMap.has(sid)) {
    return pdfMap.get(sid)!;
  }
  if (pdfMap.has(tower.id)) {
    return pdfMap.get(tower.id)!;
  }

  // Check operator station IDs if available
  if (Array.isArray(tower.operators)) {
    for (const op of tower.operators) {
      if (Array.isArray(op.stationIds)) {
        for (const osid of op.stationIds) {
          if (KNOWN_STATION_AZIMUTHS[osid]) return KNOWN_STATION_AZIMUTHS[osid];
          if (pdfMap.has(osid)) return pdfMap.get(osid)!;
        }
      }
    }
  }

  // 3. Fallback to deterministic nominal sector azimuths for macro towers
  return calculateNominalAzimuths(sid);
}

/**
 * Attaches azimuths array to a collection of towers.
 */
export function withAzimuths<T extends Record<string, unknown>>(
  db: DatabaseSync,
  towers: T[]
): Array<T & { azimuths: number[] }> {
  if (!towers.length) return [];
  const pdfMap = getCachedPdfAzimuths(db);

  return towers.map(tower => {
    const azimuths = resolveTowerAzimuths(tower as unknown as Tower, pdfMap);
    return {
      ...tower,
      azimuths,
    };
  });
}
