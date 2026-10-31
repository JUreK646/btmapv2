import { openDatabase } from '../server/database.ts';
import { createSi2pemSync } from '../server/si2pemSync.ts';
import { invalidateStatsCache } from '../server/stats.ts';

const force = process.argv.includes('--force');
const db = openDatabase();

console.log(`[CLI] Rozpoczynam synchronizację SI2PEM (force: ${force})...`);
try {
  const si2pem = createSi2pemSync(db);
  await si2pem.syncNow(true);
  invalidateStatsCache();
  const countRow = db.prepare('SELECT COUNT(*) as c FROM pem_plans').get() as { c: number };
  console.log(`[CLI] Synchronizacja SI2PEM zakończona pomyślnie. W bazie jest ${countRow.c} aktualnych pomiarów.`);
} catch (err) {
  console.error(`[CLI] Wystąpił błąd synchronizacji SI2PEM:`, err);
  process.exitCode = 1;
} finally {
  db.close();
}
