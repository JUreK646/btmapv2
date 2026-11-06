import { openDatabase } from '../server/database.ts';
import { syncRadiolinesFromUke } from '../server/radiolineSync.ts';

const localFileArg = process.argv.find(a => a.endsWith('.zip') || a.endsWith('.xlsx'));
const db = openDatabase();

console.log('[CLI] Rozpoczynam pobieranie i synchronizację wykazu linii radiowych UKE...');
try {
  const result = await syncRadiolinesFromUke(db, { localZipPath: localFileArg });
  console.log('[CLI] Wynik synchronizacji radiolinii:', result);
} catch (err) {
  console.error('[CLI] Wystąpił błąd podczas synchronizacji radiolinii:', err);
  process.exitCode = 1;
} finally {
  db.close();
}
