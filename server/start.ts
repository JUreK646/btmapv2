import { createApp } from './app.ts';
import { openDatabase } from './database.ts';
import { createSi2pemSync } from './si2pemSync.ts';
import { createUkeSync } from './ukeSync.ts';
import { createRadiolineSync } from './radiolineSync.ts';
import { ensureRegistrySnapshot } from './stats.ts';
import { installProcessGuards } from './processGuards.ts';

const db = openDatabase();
// Baseline for growth statistics: the next UKE registry sync is compared against it.
try { ensureRegistrySnapshot(db); } catch (err) { console.warn('[stats] Nie zapisano migawki bazowej:', (err as Error).message); }
const si2pem = createSi2pemSync(db);
const ukeSync = createUkeSync(db);
const radiolineSync = createRadiolineSync(db);
const port = Number(process.env.PORT || 3001);

const server = createApp(db, si2pem).listen(port, process.env.HOST || '127.0.0.1', () => {
  console.log(`BTMap v2 API: http://127.0.0.1:${port}`);
  si2pem.start();
  ukeSync.start();
  radiolineSync.start();
});

const release = async () => {
  await radiolineSync.stop();
  await ukeSync.stop();
  await si2pem.stop();
  db.close();
};
const stop = () => server.close(async () => {
  await release();
  process.exit(0);
});

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

installProcessGuards(release);
