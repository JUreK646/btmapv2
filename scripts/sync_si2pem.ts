// Downloads the SI2PEM measurement schedule into the database.
// Usage: pnpm sync:si2pem [--force]   (--force downloads even when the saved schedule is still fresh)
import { openDatabase } from '../server/database.ts';
import { createSi2pemSync } from '../server/si2pemSync.ts';
import { invalidateStatsCache } from '../server/stats.ts';

const force = process.argv.includes('--force');
const db = openDatabase();

console.log(`[CLI] Rozpoczynam synchronizację SI2PEM (force: ${force})...`);
try {
  const si2pem = createSi2pemSync(db);
  const downloaded = await si2pem.syncPlans(force);
  invalidateStatsCache();
  const countRow = db.prepare('SELECT COUNT(*) as c FROM pem_plans').get() as { c: number };
  console.log(downloaded
    ? `[CLI] Synchronizacja SI2PEM zakończona pomyślnie. W bazie jest ${countRow.c} aktualnych pomiarów.`
    : `[CLI] Harmonogram SI2PEM jest aktualny (${countRow.c} pomiarów w bazie). Użyj --force, aby pobrać go ponownie.`);
} catch (err) {
  console.error(`[CLI] Synchronizacja SI2PEM nie powiodła się:`, (err as Error).message);
  process.exitCode = 1;
} finally {
  db.close();
}
