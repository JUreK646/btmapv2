import { openDatabase } from '../server/database.ts';
import { syncUkeWykaz } from '../server/ukeSync.ts';
import { invalidateStatsCache } from '../server/stats.ts';

const force = process.argv.includes('--force');
const db = openDatabase();

console.log(`[CLI] Rozpoczynam sprawdzanie wykazu UKE (force: ${force})...`);
try {
  const result = await syncUkeWykaz(db, { force });
  invalidateStatsCache();
  console.log(`[CLI] Wynik:`, result);
} catch (err) {
  console.error(`[CLI] Wystąpił błąd:`, err);
  process.exitCode = 1;
} finally {
  db.close();
}
