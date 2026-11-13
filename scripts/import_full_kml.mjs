import { createReadStream } from 'node:fs';
import readline from 'node:readline';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

console.time('FullKMLIngestion');

const db = new DatabaseSync('data/btmap.sqlite');
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA busy_timeout=30000;
  PRAGMA synchronous=NORMAL;
`);

// 1. Build an in-memory index of existing DB towers
console.log('Loading existing DB towers into memory...');
const dbRows = db.prepare("SELECT id, stationId, lat, lng, operators, source, addedBy, province, address FROM towers WHERE status='APPROVED'").all();
console.log(`Found ${dbRows.length} existing towers in DB.`);

const towersById = new Map();
const towersByStationId = new Map(); // stationId -> array of tower rows
const towersByCoord = new Map(); // "lat,lng" -> array of tower rows

for (const row of dbRows) {
  towersById.set(row.id, row);
  if (row.stationId) {
    const sidUpper = String(row.stationId).trim().toUpperCase();
    if (!towersByStationId.has(sidUpper)) towersByStationId.set(sidUpper, []);
    towersByStationId.get(sidUpper).push(row);
  }
  const ck = `${Number(row.lat).toFixed(4)},${Number(row.lng).toFixed(4)}`;
  if (!towersByCoord.has(ck)) towersByCoord.set(ck, []);
  towersByCoord.get(ck).push(row);
}

// 2. Parse data/source-stations.kml
console.log('Parsing data/source-stations.kml...');
const rl = readline.createInterface({
  input: createReadStream('data/source-stations.kml'),
  crlfDelay: Infinity,
});

const OP_COLORS = {
  'Orange': '#ff7900',
  'T-Mobile': '#e20074',
  'Play': '#7b2cbf',
  'Plus': '#10b981',
};

const stations = new Map(); // key -> station data
let inFolder = '';
let inPlacemark = false;
let curPlacemark = '';

for await (const line of rl) {
  const folderMatch = line.match(/<name>(Orange|Play|Plus|T-Mobile)<\/name>/);
  if (folderMatch && OP_COLORS[folderMatch[1]]) {
    inFolder = folderMatch[1];
  }

  if (line.includes('<Placemark>')) {
    inPlacemark = true;
    curPlacemark = '';
  }
  if (inPlacemark) {
    curPlacemark += line + '\n';
  }
  if (line.includes('</Placemark>')) {
    inPlacemark = false;
    if (inFolder && curPlacemark.includes('<Point>')) {
      const nameMatch = curPlacemark.match(/<name>([^<]+)<\/name>/);
      const coordMatch = curPlacemark.match(/<coordinates>([^<]+)<\/coordinates>/);
      const descMatch = curPlacemark.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);

      if (nameMatch && coordMatch) {
        const stationId = nameMatch[1].trim();
        const coords = coordMatch[1].trim().split(',');
        const lng = parseFloat(coords[0]);
        const lat = parseFloat(coords[1]);

        if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= 48 && lat <= 56 && lng >= 13 && lng <= 25) {
          const desc = descMatch ? descMatch[1] : '';
          const cityMatch = desc.match(/<b>City:<\/b>\s*(.*?)(?:<br|$)/);
          const addrMatch = desc.match(/<b>Address:<\/b>\s*(.*?)(?:<br|$)/);
          const regMatch = desc.match(/<b>Region:<\/b>\s*(.*?)(?:<br|$)/);
          const azMatch = desc.match(/<b>Azimuths:<\/b>\s*(.*?)(?:<br|$)/);

          const city = cityMatch ? cityMatch[1].trim() : '';
          const addr = addrMatch ? addrMatch[1].trim() : '';
          const address = [city, addr].filter(Boolean).join(', ');
          const province = regMatch ? regMatch[1].trim() : '';
          const azimuths = azMatch ? azMatch[1].split(',').map(s => parseInt(s.replace(/\D/g, ''), 10)).filter(Number.isFinite) : [];

          // Extract all permits from description
          const permitRegex = /([A-Za-z0-9]+)\s+(\d+):\s*([^\n<]+)/g;
          const bandsList = [];
          const seenBands = new Set();

          let pm;
          while ((pm = permitRegex.exec(desc)) !== null) {
            let tech = pm[1].toUpperCase();
            if (tech === 'NR') tech = '5G';
            const band = pm[2];
            const permitStr = pm[3].trim();
            const bKey = `${tech}_${band}_${permitStr}`;
            if (!seenBands.has(bKey)) {
              seenBands.add(bKey);
              bandsList.push({
                tech,
                band,
                status: 'Pozwolenie',
                permit: permitStr,
              });
            }
          }

          if (bandsList.length === 0) {
            const bMatch = desc.match(/<b>Bands:<\/b>\s*(.*?)(?:<br|$)/);
            if (bMatch) {
              for (const raw of bMatch[1].split(',')) {
                const bm = raw.trim().match(/^([A-Za-z0-9]+)\s+(\d+)/);
                if (bm) {
                  let tech = bm[1].toUpperCase();
                  if (tech === 'NR') tech = '5G';
                  bandsList.push({
                    tech,
                    band: bm[2],
                    status: 'Pozwolenie',
                    permit: '',
                  });
                }
              }
            }
          }

          const coordKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
          const key = `${coordKey}|${inFolder}|${stationId}`;

          let st = stations.get(key);
          if (!st) {
            const id = 'UKE_' + createHash('sha256').update(key).digest('hex').slice(0, 18);
            st = {
              id,
              stationId,
              address,
              province,
              lat,
              lng,
              operator: inFolder,
              bands: [],
              azimuths,
            };
            stations.set(key, st);
          }

          for (const b of bandsList) {
            const exists = st.bands.some(x => x.tech === b.tech && x.band === b.band && x.permit === b.permit);
            if (!exists) {
              st.bands.push(b);
            }
          }

          if (azimuths.length > 0 && st.azimuths.length === 0) {
            st.azimuths = azimuths;
          }
        }
      }
    }
  }
}

console.log(`Parsed ${stations.size} unique stations from KML.`);

// 3. Batch upsert into SQLite
console.log('Updating SQLite database...');
const insertStmt = db.prepare(`
  INSERT INTO towers (id, stationId, address, province, lat, lng, operators, source, addedBy, status, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?)
`);

const updateStmt = db.prepare(`
  UPDATE towers
  SET operators = ?,
      stationId = COALESCE(NULLIF(stationId, ''), ?),
      address = COALESCE(NULLIF(address, ''), ?),
      province = COALESCE(NULLIF(province, ''), ?),
      addedBy = 'Import KML',
      source = 'UKE'
  WHERE id = ?
`);

let updatedCount = 0;
let insertedCount = 0;
let totalPermitsAdded = 0;

db.exec('BEGIN TRANSACTION;');

for (const kmlSt of stations.values()) {
  // Find match in DB
  let matchedDbRow = towersById.get(kmlSt.id);

  if (!matchedDbRow && kmlSt.stationId) {
    const candidateList = towersByStationId.get(kmlSt.stationId.toUpperCase());
    if (candidateList && candidateList.length > 0) {
      // Find candidate matching operator or close distance
      for (const cand of candidateList) {
        if (cand.operators && cand.operators.includes(kmlSt.operator)) {
          matchedDbRow = cand;
          break;
        }
      }
      if (!matchedDbRow) matchedDbRow = candidateList[0];
    }
  }

  if (!matchedDbRow) {
    const ck = `${kmlSt.lat.toFixed(4)},${kmlSt.lng.toFixed(4)}`;
    const candidateList = towersByCoord.get(ck);
    if (candidateList && candidateList.length > 0) {
      for (const cand of candidateList) {
        if (cand.operators && cand.operators.includes(kmlSt.operator)) {
          matchedDbRow = cand;
          break;
        }
      }
    }
  }

  if (matchedDbRow) {
    // Merge operators and bands
    let ops = [];
    try {
      ops = JSON.parse(matchedDbRow.operators);
    } catch {
      ops = [];
    }
    if (!Array.isArray(ops)) ops = [];

    let targetOp = ops.find(o => o.name === kmlSt.operator);
    if (!targetOp) {
      targetOp = {
        name: kmlSt.operator,
        color: OP_COLORS[kmlSt.operator] || '#71808a',
        stationIds: [kmlSt.stationId],
        bands: [],
      };
      ops.push(targetOp);
    }

    if (!Array.isArray(targetOp.stationIds)) targetOp.stationIds = [];
    if (kmlSt.stationId && !targetOp.stationIds.includes(kmlSt.stationId)) {
      targetOp.stationIds.push(kmlSt.stationId);
    }

    if (!Array.isArray(targetOp.bands)) targetOp.bands = [];

    // Merge bands: index existing bands
    const existingBandKeys = new Set(targetOp.bands.map(b => `${b.tech}_${b.band}_${b.permit || ''}`));

    let addedForThis = 0;
    for (const kb of kmlSt.bands) {
      const kKey = `${kb.tech}_${kb.band}_${kb.permit || ''}`;
      if (!existingBandKeys.has(kKey)) {
        // Also check if existing has a permit-less version that can be upgraded
        const permitlessIdx = targetOp.bands.findIndex(b => b.tech === kb.tech && b.band === kb.band && !b.permit);
        if (permitlessIdx !== -1 && kb.permit) {
          targetOp.bands[permitlessIdx] = kb;
          existingBandKeys.add(kKey);
          addedForThis++;
        } else {
          targetOp.bands.push(kb);
          existingBandKeys.add(kKey);
          addedForThis++;
        }
      }
    }

    // Attach azimuths if available and missing
    if (kmlSt.azimuths.length > 0 && (!targetOp.azimuths || targetOp.azimuths.length === 0)) {
      targetOp.azimuths = kmlSt.azimuths;
    }

    totalPermitsAdded += addedForThis;
    const newOpsJson = JSON.stringify(ops);
    matchedDbRow.operators = newOpsJson;

    updateStmt.run(newOpsJson, kmlSt.stationId, kmlSt.address, kmlSt.province, matchedDbRow.id);
    updatedCount++;
  } else {
    // Insert new tower
    const opObj = {
      name: kmlSt.operator,
      color: OP_COLORS[kmlSt.operator] || '#71808a',
      stationIds: [kmlSt.stationId],
      bands: kmlSt.bands,
      azimuths: kmlSt.azimuths,
    };
    const opsJson = JSON.stringify([opObj]);

    insertStmt.run(
      kmlSt.id,
      kmlSt.stationId,
      kmlSt.address,
      kmlSt.province,
      kmlSt.lat,
      kmlSt.lng,
      opsJson,
      'UKE',
      'Import KML',
      '2026-10-31T00:00:00.000Z'
    );
    insertedCount++;
    totalPermitsAdded += kmlSt.bands.length;
  }
}

db.exec('COMMIT;');

console.log(`Upsert complete! Updated: ${updatedCount}, Inserted: ${insertedCount}, Permits added/merged: ${totalPermitsAdded}`);

// 4. Verify DB counts
const finalTowers = db.prepare("SELECT count(*) as c FROM towers WHERE status='APPROVED'").get();
const plusTowers = db.prepare("SELECT count(*) as c FROM towers WHERE status='APPROVED' AND operators LIKE '%Plus%'").get();
console.log(`Total approved towers in DB: ${finalTowers.c}`);
console.log(`Total Plus towers in DB: ${plusTowers.c}`);

console.timeEnd('FullKMLIngestion');
db.close();
