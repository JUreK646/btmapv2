import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export interface KmlStationAzimuths {
  stationId: string;
  operator: string;
  lat: number;
  lng: number;
  azimuths: number[];
}

/** Keeps whole degrees in 0-359 (360 is the same direction as 0), unique and sorted. */
export function normalizeAzimuths(values: unknown[]): number[] {
  const result = new Set<number>();
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const degrees = typeof value === 'number' ? value : Number(String(value).replace(/[°\s]/g, '').replace(',', '.'));
    if (!Number.isFinite(degrees) || degrees < 0 || degrees > 360) continue;
    result.add(Math.round(degrees) % 360);
  }
  return [...result].sort((a, b) => a - b);
}

/**
 * Reads the "Azimuths:" field that the UKE permit KML carries for station placemarks.
 * The operator is the name of the folder a placemark sits in.
 */
export function parseKmlStationAzimuths(kml: string): KmlStationAzimuths[] {
  const stations: KmlStationAzimuths[] = [];
  const folders: string[] = [];
  const token = /<Folder[^>]*>\s*(?:<name>([^<]*)<\/name>)?|<\/Folder>|<Placemark[^>]*>([\s\S]*?)<\/Placemark>/g;
  let match: RegExpExecArray | null;
  while ((match = token.exec(kml))) {
    if (match[0].startsWith('</Folder')) { folders.pop(); continue; }
    if (match[0].startsWith('<Folder')) { folders.push((match[1] || '').trim()); continue; }

    const body = match[2];
    if (!body.includes('<Point>')) continue;
    const azimuthField = body.match(/<b>Azimuths:<\/b>\s*(.*?)(?:<br|\]\]>|$)/);
    if (!azimuthField) continue;
    const azimuths = normalizeAzimuths(azimuthField[1].split(','));
    const stationId = body.match(/<name>([^<]+)<\/name>/)?.[1]?.trim();
    const coords = body.match(/<coordinates>([^<]+)<\/coordinates>/)?.[1]?.trim().split(',');
    const lng = Number(coords?.[0]), lat = Number(coords?.[1]);
    const operator = folders[folders.length - 1];
    if (!azimuths.length || !stationId || !operator || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    stations.push({ stationId, operator, lat, lng, azimuths });
  }
  return stations;
}

type StoredOperator = { name?: string; stationIds?: string[]; azimuths?: number[] };

/**
 * Stores UKE azimuths on the matching operator of the matching station.
 * A station is matched by the id the KML import derives from its coordinates, operator and station id,
 * and otherwise by station id + operator. Nothing is created and no other field is touched.
 */
export function applyKmlAzimuths(db: DatabaseSync, stations: KmlStationAzimuths[]) {
  const rows = db.prepare('SELECT id, stationId, operators FROM towers').all() as Array<{ id: string; stationId: string | null; operators: string }>;
  const byId = new Map(rows.map(row => [row.id, row]));
  const byStation = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = String(row.stationId || '').trim().toUpperCase();
    if (key) byStation.set(key, [...(byStation.get(key) || []), row]);
  }
  const hasOperator = (row: { operators: string }, operator: string) => {
    try { return (JSON.parse(row.operators) as StoredOperator[]).some(op => op?.name === operator); } catch { return false; }
  };

  const update = db.prepare('UPDATE towers SET operators=? WHERE id=?');
  let matched = 0, updated = 0;
  db.exec('BEGIN');
  try {
    for (const station of stations) {
      const key = `${station.lat.toFixed(6)},${station.lng.toFixed(6)}|${station.operator}|${station.stationId}`;
      const row = byId.get('UKE_' + createHash('sha256').update(key).digest('hex').slice(0, 18))
        || (byStation.get(station.stationId.toUpperCase()) || []).find(candidate => hasOperator(candidate, station.operator));
      if (!row) continue;

      let operators: StoredOperator[];
      try { operators = JSON.parse(row.operators); } catch { continue; }
      const operator = Array.isArray(operators) ? operators.find(op => op?.name === station.operator) : undefined;
      if (!operator) continue;
      matched++;
      if (JSON.stringify(operator.azimuths || []) === JSON.stringify(station.azimuths)) continue;
      operator.azimuths = station.azimuths;
      row.operators = JSON.stringify(operators);
      update.run(row.operators, row.id);
      updated++;
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { stations: stations.length, matched, updated };
}

/**
 * A registry sync replaces a station's operators. Azimuths the new registry does not carry are kept
 * from the stored record, so a sync never silently drops them.
 */
export function carryOverAzimuths<T extends { name: string; azimuths?: number[] }>(next: T[], storedOperatorsJson: unknown): T[] {
  let stored: StoredOperator[] = [];
  try { stored = JSON.parse(String(storedOperatorsJson || '[]')); } catch { return next; }
  if (!Array.isArray(stored)) return next;
  for (const op of next) {
    if (Array.isArray(op.azimuths) && op.azimuths.length > 0) continue;
    const previous = normalizeAzimuths(stored.find(s => s?.name === op.name)?.azimuths || []);
    if (previous.length > 0) op.azimuths = previous;
  }
  return next;
}
