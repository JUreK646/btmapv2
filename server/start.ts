import { createApp } from './app.ts';
import { openDatabase } from './database.ts';
import { createSi2pemSync } from './si2pemSync.ts';
import { createUkeSync } from './ukeSync.ts';

const db = openDatabase();
const si2pem = createSi2pemSync(db);
const ukeSync = createUkeSync(db);
const port = Number(process.env.PORT || 3001);

const server = createApp(db, si2pem).listen(port, process.env.HOST || '127.0.0.1', () => {
  console.log(`BTMap v2 API: http://127.0.0.1:${port}`);
  si2pem.start();
  ukeSync.start();
});

const stop = () => server.close(async () => {
  await ukeSync.stop();
  await si2pem.stop();
  db.close();
  process.exit(0);
});

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
