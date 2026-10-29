import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { operatorName } from '../shared/operators.ts';

export function openDatabase(
  filename = process.env.BTMAP_DB || (existsSync('data/btmap.sqlite') ? 'data/btmap.sqlite' : 'server/BTMap.db')
) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS towers (
      id TEXT PRIMARY KEY, stationId TEXT, address TEXT, province TEXT, lat REAL, lng REAL,
      operators TEXT NOT NULL DEFAULT '[]', mastType TEXT, owner TEXT, height REAL, notes TEXT,
      source TEXT DEFAULT 'BTMAP', addedBy TEXT, teryt TEXT, status TEXT DEFAULT 'APPROVED', createdAt TEXT
    );
    CREATE INDEX IF NOT EXISTS towers_location ON towers(lat, lng);
    CREATE INDEX IF NOT EXISTS towers_source ON towers(source, status);
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE, nick TEXT, password TEXT, avatar TEXT,
      points INTEGER DEFAULT 0, level INTEGER DEFAULT 1, role TEXT DEFAULT 'USER',
      status TEXT DEFAULT 'OFFLINE', createdAt TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, userId TEXT, expiresAt INTEGER);
    CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, towerId TEXT, userNick TEXT, text TEXT, photoUrl TEXT, createdAt TEXT);
    CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, towerId TEXT, userNick TEXT, url TEXT, caption TEXT, createdAt TEXT);
    CREATE TABLE IF NOT EXISTS tower_history (
      id TEXT PRIMARY KEY,
      towerId TEXT NOT NULL,
      userNick TEXT NOT NULL,
      changeType TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      diffJson TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tower_history_towerId ON tower_history(towerId);
    CREATE INDEX IF NOT EXISTS tower_history_createdAt ON tower_history(createdAt);
    CREATE TABLE IF NOT EXISTS queue (id TEXT PRIMARY KEY, type TEXT, data TEXT, userNick TEXT, status TEXT DEFAULT 'PENDING', createdAt TEXT);
    CREATE TABLE IF NOT EXISTS logs (id TEXT PRIMARY KEY, userNick TEXT, action TEXT, target TEXT, status TEXT, createdAt TEXT);
    CREATE TABLE IF NOT EXISTS radiolines (id TEXT PRIMARY KEY, latA REAL, lngA REAL, latB REAL, lngB REAL, frequency REAL, operator TEXT, stationA TEXT, stationB TEXT);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS pem_plans (id TEXT PRIMARY KEY,lat REAL NOT NULL,lng REAL NOT NULL,operator TEXT NOT NULL,dateTo TEXT NOT NULL,data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS pem_plans_location ON pem_plans(lat,lng);
    CREATE INDEX IF NOT EXISTS pem_plans_expiry ON pem_plans(dateTo);
    CREATE TABLE IF NOT EXISTS pem_reports_cache (key TEXT PRIMARY KEY,tower TEXT NOT NULL,data TEXT NOT NULL,checkedAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pem_report_counts (towerId TEXT PRIMARY KEY,count INTEGER NOT NULL,partial INTEGER NOT NULL,checkedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pem_report_operator_counts (towerId TEXT NOT NULL,operator TEXT NOT NULL,count INTEGER NOT NULL,partial INTEGER NOT NULL,checkedAt TEXT NOT NULL,PRIMARY KEY(towerId,operator));
    CREATE TABLE IF NOT EXISTS pem_pdf_cache (key TEXT PRIMARY KEY,data TEXT NOT NULL,checkedAt INTEGER NOT NULL);
  `);
  try {
    db.exec('ALTER TABLE comments ADD COLUMN photoUrl TEXT');
  } catch {
    // Column already exists
  }
  if (!db.prepare("SELECT value FROM metadata WHERE key='pemReportCatalogV2'").get()) {
    db.exec(
      `BEGIN;DELETE FROM pem_reports_cache;DELETE FROM pem_report_counts;INSERT INTO metadata(key,value) VALUES('pemReportCatalogV2','1');COMMIT;`
    );
  }
  db.exec(`INSERT OR IGNORE INTO pem_report_counts(towerId,count,partial,checkedAt)
    SELECT json_extract(tower,'$.id'),COALESCE(json_extract(data,'$.reportCount'),json_array_length(data,'$.reports')),COALESCE(json_extract(data,'$.partial'),0),json_extract(data,'$.checkedAt')
    FROM pem_reports_cache WHERE json_valid(tower) AND json_valid(data) AND json_type(data,'$.reports')='array' AND json_extract(data,'$.checkedAt') IS NOT NULL ORDER BY checkedAt DESC`);
  if (!db.prepare("SELECT value FROM metadata WHERE key='pemOperatorReportsV1'").get()) {
    db.exec(`BEGIN;
      DELETE FROM pem_reports_cache WHERE json_valid(tower) AND CASE WHEN json_valid(tower) THEN json_array_length(tower,'$.operators') ELSE 0 END>1;
      DELETE FROM pem_report_counts;
      INSERT OR IGNORE INTO pem_report_operator_counts(towerId,operator,count,partial,checkedAt)
        SELECT json_extract(tower,'$.id'),COALESCE(json_extract(tower,'$.operators[0].name'),'UKE'),
          COALESCE(json_extract(data,'$.reportCount'),json_array_length(data,'$.reports')),
          COALESCE(json_extract(data,'$.partial'),0),json_extract(data,'$.checkedAt')
        FROM pem_reports_cache WHERE json_valid(tower) AND json_valid(data)
          AND CASE WHEN json_valid(tower) THEN json_array_length(tower,'$.operators') ELSE 0 END<=1
          AND json_type(data,'$.reports')='array' AND json_extract(data,'$.checkedAt') IS NOT NULL;
      INSERT INTO metadata(key,value) VALUES('pemOperatorReportsV1','1');
      COMMIT;`);
  }
  const queueColumns = db.prepare('PRAGMA table_info(queue)').all();
  if (!queueColumns.some(column => column.name === 'userId')) db.exec('ALTER TABLE queue ADD COLUMN userId TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS queue_user ON queue(userId)');

  // Reclassify saved SI2PEM entries without downloading the source again.
  if (!db.prepare("SELECT value FROM metadata WHERE key='pemOperatorColorsV2'").get()) {
    db.exec('BEGIN');
    try {
      const update = db.prepare('UPDATE pem_plans SET operator=?,data=? WHERE id=?');
      for (const row of db.prepare('SELECT id,data FROM pem_plans').all()) {
        const plan = JSON.parse(String(row.data));
        plan.operator = operatorName(String(plan.operatorName || plan.operator || ''));
        update.run(plan.operator, JSON.stringify(plan), row.id);
      }
      db.prepare('INSERT INTO metadata(key,value) VALUES(?,?)').run('pemOperatorColorsV2', '1');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  // Ensure co-located stations from different operators each have their own station record and stationId
  if (!db.prepare("SELECT value FROM metadata WHERE key='splitCoLocatedOperatorsV1'").get()) {
    db.exec('BEGIN');
    try {
      const multiRows = db
        .prepare("SELECT * FROM towers WHERE json_valid(operators) AND json_array_length(operators) > 1")
        .all() as Array<Record<string, unknown>>;

      if (multiRows.length > 0) {
        const insertTower = db.prepare(`
          INSERT OR REPLACE INTO towers (
            id, stationId, address, province, lat, lng, operators,
            mastType, owner, height, notes, source, addedBy, teryt, status, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const deleteTower = db.prepare('DELETE FROM towers WHERE id = ?');
        const getPemCount = db.prepare(
          'SELECT count, partial, checkedAt FROM pem_report_operator_counts WHERE towerId = ? AND operator = ?'
        );
        const insertPemCount = db.prepare(
          'INSERT OR REPLACE INTO pem_report_operator_counts (towerId, operator, count, partial, checkedAt) VALUES (?, ?, ?, ?, ?)'
        );

        for (const row of multiRows) {
          const ops = JSON.parse(String(row.operators || '[]')) as Array<{
            name: string;
            color?: string;
            stationIds?: string[];
            bands?: unknown[];
          }>;
          if (ops.length <= 1) continue;

          const baseLat = Number(row.lat);
          const baseLng = Number(row.lng);
          const oldId = String(row.id);

          deleteTower.run(oldId);

          ops.forEach((op, idx) => {
            const opStationId = op.stationIds?.[0] || String(row.stationId || '');
            // Separate co-located pins by ~7 meters so each station is individually clickable on the map
            const angle = (idx * 2 * Math.PI) / ops.length;
            const offsetLat = idx === 0 ? 0 : Math.cos(angle) * 0.000055;
            const offsetLng = idx === 0 ? 0 : Math.sin(angle) * 0.000085;
            const newLat = Math.round((baseLat + offsetLat) * 1000000) / 1000000;
            const newLng = Math.round((baseLng + offsetLng) * 1000000) / 1000000;

            const newId =
              idx === 0
                ? oldId
                : 'UKE_' +
                  createHash('sha256')
                    .update(`${baseLat.toFixed(6)},${baseLng.toFixed(6)}|${op.name}|${opStationId}|${idx}`)
                    .digest('hex')
                    .slice(0, 18);

            insertTower.run(
              newId,
              opStationId,
              String(row.address || ''),
              String(row.province || ''),
              newLat,
              newLng,
              JSON.stringify([op]),
              row.mastType ? String(row.mastType) : null,
              row.owner ? String(row.owner) : null,
              typeof row.height === 'number' ? row.height : null,
              row.notes ? String(row.notes) : null,
              String(row.source || 'BTMAP'),
              String(row.addedBy || 'BTMAP'),
              row.teryt ? String(row.teryt) : null,
              String(row.status || 'APPROVED'),
              String(row.createdAt || new Date().toISOString())
            );

            const pemRow = getPemCount.get(oldId, op.name) as
              | { count: number; partial: number; checkedAt: string }
              | undefined;
            if (pemRow) {
              insertPemCount.run(newId, op.name, pemRow.count, pemRow.partial, pemRow.checkedAt);
            }
          });
        }
      }

      db.prepare("INSERT OR REPLACE INTO metadata(key, value) VALUES('splitCoLocatedOperatorsV1', '1')").run();
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  
  if (!db.prepare("SELECT value FROM metadata WHERE key='btmapSourceV1'").get()) {
    db.exec(`BEGIN;
      UPDATE towers SET source='BTMAP' WHERE source='UKE' OR source='User' OR source IS NULL;
      INSERT OR REPLACE INTO metadata(key,value) VALUES('btmapSourceV1','1');
    COMMIT;`);
  }

  
  if (!db.prepare("SELECT value FROM metadata WHERE key='revertUkeSourceV2'").get()) {
    db.exec(`BEGIN;
      UPDATE towers SET source='UKE' WHERE addedBy IN ('Import KML', 'AutoSync BIP UKE') OR id LIKE 'UKE_%';
      INSERT OR REPLACE INTO metadata(key,value) VALUES('revertUkeSourceV2','1');
    COMMIT;`);
  }

  db.function('fold', { deterministic: true }, value =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ł/gi, 'l')
      .toLowerCase()
  );
  return db;
}
