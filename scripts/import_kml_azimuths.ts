// Adds the antenna azimuths from the UKE permit KML to stations already in the database.
// Usage: pnpm import:azimuths [path/to/stations.kml] [path/to/database.sqlite]
import { readFileSync } from 'node:fs';
import { openDatabase } from '../server/database.ts';
import { applyKmlAzimuths, parseKmlStationAzimuths } from '../server/kmlAzimuths.ts';

const source = process.argv[2] || 'data/source-stations.kml';
const db = openDatabase(process.argv[3]);
try {
  const stations = parseKmlStationAzimuths(readFileSync(source, 'utf8'));
  const result = applyKmlAzimuths(db, stations);
  console.log(`Azymuty UKE z ${source}: ${result.stations} stacji w pliku, ${result.matched} dopasowanych w bazie, ${result.updated} zaktualizowanych.`);
} finally {
  db.close();
}
