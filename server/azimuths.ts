import type { DatabaseSync } from 'node:sqlite';
import type { Tower } from '../src/types.ts';

/**
 * Where a station's antenna azimuths come from:
 * - `si2pem`   – antenna table of an accredited SI2PEM measurement report (parsed PDF)
 * - `verified` – ground truth checked on site for a specific station
 * - `uke`      – azimuths the UKE registry holds for the station (permit KML or a registry file with an azimuth column)
 * - `station`  – azimuths entered per cell in a community submission
 * - `unknown`  – no source has them; the list is empty. Directions are never guessed.
 */
export type AzimuthSource = 'si2pem' | 'verified' | 'uke' | 'station' | 'unknown';
export interface TowerAzimuths { azimuths: number[]; source: AzimuthSource }

// Known specific stations (e.g. from user screenshots or official ground truth audits)
const KNOWN_STATION_AZIMUTHS: Record<string, number[]> = {
  // Stary Sącz / Stadła - Podegrodzka 640 (T-Mobile / NetWorkS! 57263)
  '57263': [30, 200, 310],
  // Klembów (Orange / T-Mobile 80976)
  '80976': [110, 220, 320],
};

const PDF_CACHE_TTL_MS = 60_000;
const pdfCache = new WeakMap<DatabaseSync, { at: number; map: Map<string, number[]> }>();

const cleanAzimuths = (values: unknown[]): number[] =>
  Array.from(new Set(values.filter(v => v !== null && v !== undefined && v !== '').map(Number).filter(a => Number.isFinite(a) && a >= 0 && a <= 360))).sort((a, b) => a - b);

export function getCachedPdfAzimuths(db: DatabaseSync): Map<string, number[]> {
  const cached = pdfCache.get(db);
  if (cached && Date.now() - cached.at < PDF_CACHE_TTL_MS) return cached.map;

  const map = new Map<string, number[]>();
  try {
    const rows = db.prepare('SELECT data FROM pem_pdf_cache').all() as { data: string }[];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.data);
        if (Array.isArray(parsed.antennas) && parsed.antennas.length > 0 && Array.isArray(parsed.stationIds)) {
          const azs = cleanAzimuths(parsed.antennas.map((a: { azimuth?: number }) => a?.azimuth));
          if (azs.length > 0) for (const sid of parsed.stationIds) if (sid) map.set(String(sid), azs);
        }
      } catch {
        // Skip corrupt entry
      }
    }
  } catch {
    // Return empty on query error
  }

  pdfCache.set(db, { at: Date.now(), map });
  return map;
}

/** Azimuths the UKE registry holds for the station's operators (KML/registry import). */
function ukeAzimuths(tower: Tower): number[] {
  const values: unknown[] = [];
  for (const op of Array.isArray(tower.operators) ? tower.operators : []) {
    if (Array.isArray(op?.azimuths)) values.push(...op.azimuths);
  }
  return cleanAzimuths(values);
}

/** Azimuths recorded per band/cell on the station record (community submission). */
function stationRecordAzimuths(tower: Tower): number[] {
  const values: unknown[] = [];
  for (const op of Array.isArray(tower.operators) ? tower.operators : []) {
    for (const band of Array.isArray(op?.bands) ? op.bands : []) {
      if (Array.isArray(band?.azimuths)) values.push(...band.azimuths);
      else if (band?.azimuth !== undefined) values.push(band.azimuth);
    }
  }
  return cleanAzimuths(values);
}

/**
 * Resolves the antenna azimuths for a given tower from real sources only:
 * 1. station-specific ground truth, 2. parsed SI2PEM reports (measured on site), 3. the UKE registry,
 * 4. azimuths entered in a community submission.
 * When none of them has data the result is an empty list marked `unknown`.
 */
export function resolveTowerAzimuths(tower: Tower, pdfMap: Map<string, number[]>): TowerAzimuths {
  const ids = [tower.stationId, tower.id, ...(Array.isArray(tower.operators) ? tower.operators.flatMap(op => Array.isArray(op?.stationIds) ? op.stationIds : []) : [])]
    .filter((id): id is string => Boolean(id)).map(String);

  for (const id of ids) if (KNOWN_STATION_AZIMUTHS[id]) return { azimuths: KNOWN_STATION_AZIMUTHS[id], source: 'verified' };
  for (const id of ids) if (pdfMap.has(id)) return { azimuths: pdfMap.get(id)!, source: 'si2pem' };

  const registry = ukeAzimuths(tower);
  if (registry.length > 0) return { azimuths: registry, source: 'uke' };

  const recorded = stationRecordAzimuths(tower);
  if (recorded.length > 0) return { azimuths: recorded, source: 'station' };

  return { azimuths: [], source: 'unknown' };
}

/**
 * Attaches azimuths and their source to a collection of towers.
 */
export function withAzimuths<T extends Record<string, unknown>>(
  db: DatabaseSync,
  towers: T[]
): Array<T & { azimuths: number[]; azimuthsSource: AzimuthSource }> {
  if (!towers.length) return [];
  const pdfMap = getCachedPdfAzimuths(db);

  return towers.map(tower => {
    const { azimuths, source } = resolveTowerAzimuths(tower as unknown as Tower, pdfMap);
    return { ...tower, azimuths, azimuthsSource: source };
  });
}
