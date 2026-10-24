import { openDatabase } from '../server/database.ts';
import { createSi2pemSync } from '../server/si2pemSync.ts';

const force = process.argv.includes('--force');
const db = openDatabase();

console.log(`[CLI] Rozpoczynam synchronizację SI2PEM (force: ${force})...`);
try {
  const si2pem = createSi2pemSync(db);
  await si2pem.syncNow(force);
  console.log(`[CLI] Synchronizacja SI2PEM zakończona pomyślnie.`);
} catch (err) {
  console.error(`[CLI] Wystąpił błąd synchronizacji SI2PEM:`, err);
  process.exitCode = 1;
} finally {
  db.close();
}
