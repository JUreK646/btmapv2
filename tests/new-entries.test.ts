import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/database.ts';
import {getNewEntryWindow, getTowers, normalizeTower} from '../server/query.ts';
import {bandEntryDate, isNewBand, newEntryWindow, permitIssue, NEW_ENTRY_WINDOW_DAYS} from '../shared/newEntries.ts';

test('the window follows the reference date instead of fixed calendar dates', () => {
  assert.equal(NEW_ENTRY_WINDOW_DAYS, 30);
  assert.deepEqual(newEntryWindow('2026-11-06'), {referenceDate: '2026-11-06', since: '2026-10-07', year: '26'});
  // Crossing a year boundary: January entries and permits numbered /27 become the new ones.
  assert.deepEqual(newEntryWindow('2027-01-15'), {referenceDate: '2027-01-15', since: '2026-12-16', year: '27'});
  // Without a synced registry the window is anchored to today.
  assert.deepEqual(newEntryWindow(null, new Date('2028-03-01T10:00:00Z')), {referenceDate: '2028-03-01', since: '2028-01-31', year: '28'});
  assert.equal(newEntryWindow('not a date', new Date('2028-03-01T10:00:00Z')).referenceDate, '2028-03-01');
});

test('entry dates and permit years are read from real UKE permit strings', () => {
  assert.deepEqual(permitIssue('REJ/1/41451/9/26 [P] - expires 2099-12-31'), {year: '26', kind: 'P'});
  assert.deepEqual(permitIssue('CDMA420/8/0694/1/18 [zmP] - expires 2028-09-30'), {year: '18', kind: 'zmP'});
  assert.equal(permitIssue('brak'), null);
  assert.equal(bandEntryDate({permit: 'REJ/1/1/1/25 [P] - wpis 2027-01-10'}), '2027-01-10');
  assert.equal(bandEntryDate({entryDate: '2027-01-12', permit: 'wpis 2020-01-01'}), '2027-01-12');
  assert.equal(bandEntryDate({entryDate: 'garbage'}), null);

  const window = newEntryWindow('2027-01-15');
  assert.equal(isNewBand({permit: 'REJ/1/1/1/27 [P]'}, window), true);
  assert.equal(isNewBand({permit: 'REJ/1/1/1/26 [P]'}, window), false, 'last year\'s permit is no longer new');
  assert.equal(isNewBand({permit: 'REJ/1/1/1/27 [zmP]'}, window), true);
  assert.equal(isNewBand({permit: 'REJ/1/1/1/27 [zmP]'}, window, {newPermitsOnly: true}), false);
  assert.equal(isNewBand({permit: 'REJ/1/1/1/20 [P] - wpis 2026-12-16'}, window), true);
  assert.equal(isNewBand({permit: 'REJ/1/1/1/20 [P] - wpis 2026-12-15'}, window), false);
});

function fixture(wykazDate?: string) {
  const db = openDatabase(':memory:');
  if (wykazDate) db.prepare("INSERT INTO metadata(key,value) VALUES('ukeWykazDate',?)").run(wykazDate);
  const insert = db.prepare("INSERT INTO towers(id,address,province,lat,lng,operators,source,status,createdAt) VALUES(?,?,'Mazowieckie',52.2,21.0,?,'UKE','APPROVED',?)");
  const ops = (...bands: object[]) => JSON.stringify([{name: 'Play', bands: bands.map(b => ({tech: 'LTE', band: '1800', ...b}))}]);
  insert.run('old', 'Stara', ops({permit: 'REJ/1/1/1/25 [P] - expires 2099-12-31'}), '2026-06-01T00:00:00.000Z');
  insert.run('year-permit', 'Pozwolenie z roku wykazu', ops({permit: 'REJ/1/2/1/27 [P] - expires 2099-12-31'}), '2026-06-01T00:00:00.000Z');
  insert.run('amended', 'Zmiana pozwolenia', ops({permit: 'REJ/1/3/1/27 [zmP] - expires 2099-12-31'}), '2026-06-01T00:00:00.000Z');
  insert.run('wpis-recent', 'Świeży wpis', ops({permit: 'REJ/1/4/1/25 [P] - wpis 2027-01-10'}), '2026-06-01T00:00:00.000Z');
  insert.run('wpis-old', 'Stary wpis', ops({permit: 'REJ/1/5/1/25 [P] - wpis 2026-11-01'}), '2026-06-01T00:00:00.000Z');
  insert.run('entry-date', 'Pole entryDate', ops({entryDate: '2026-12-20', permit: 'REJ/1/6/1/25 [P]'}), '2026-06-01T00:00:00.000Z');
  insert.run('created-recent', 'Świeżo dodana', ops({permit: 'REJ/1/7/1/25 [P]'}), '2027-01-02T08:00:00.000Z');
  insert.run('created-old', 'Dodana dawno', ops({permit: 'REJ/1/8/1/25 [P]'}), '2026-10-28T08:00:00.000Z');
  insert.run('no-date', 'Bez dat', '[]', null);
  insert.run('garbage-date', 'Zepsuta data', ops({entryDate: 'zzzz', permit: 'brak'}), null);
  return db;
}

test('the onlyNew filter and the isNew marker agree, relative to the synced registry date', () => {
  const db = fixture('2027-01-15');
  try {
    assert.equal(getNewEntryWindow(db).since, '2026-12-16');
    const all = getTowers(db, {limit: '100'}).items;
    const flagged = all.filter(t => t.isNew).map(t => String(t.id)).sort();
    assert.deepEqual(flagged, ['created-recent', 'entry-date', 'wpis-recent', 'year-permit']);
    const filtered = getTowers(db, {onlyNew: '1', limit: '100'});
    assert.deepEqual(filtered.items.map(t => String(t.id)).sort(), flagged);
    assert.equal(filtered.total, flagged.length);
    assert.ok(filtered.items.every(t => t.isNew));

    // Individual permits are marked for the details panel; amendments count there, not at station level.
    const bandFlag = (id: string) => Boolean((all.find(t => t.id === id)!.operators as Array<{bands: Array<{isNew?: boolean}>}>)[0]?.bands[0]?.isNew);
    assert.equal(bandFlag('amended'), true);
    assert.equal(bandFlag('year-permit'), true);
    assert.equal(bandFlag('wpis-recent'), true);
    assert.equal(bandFlag('old'), false);
    assert.equal(bandFlag('wpis-old'), false);
  } finally { db.close(); }
});

test('a newer registry moves the window forward without any code change', () => {
  const db = fixture('2027-01-15');
  try {
    db.prepare("UPDATE metadata SET value='2028-02-20' WHERE key='ukeWykazDate'").run();
    assert.equal(getTowers(db, {onlyNew: '1', limit: '100'}).total, 0);
    assert.ok(getTowers(db, {limit: '100'}).items.every(t => !t.isNew));
    db.prepare("INSERT INTO towers(id,address,lat,lng,operators,source,status,createdAt) VALUES('fresh','Nowa',52.2,21.0,?,'UKE','APPROVED','2027-06-01')")
      .run(JSON.stringify([{name: 'Plus', bands: [{tech: '5G', band: '3600', permit: 'REJ/1/9/1/28 [P] - expires 2099-12-31'}]}]));
    assert.deepEqual(getTowers(db, {onlyNew: '1', limit: '100'}).items.map(t => t.id), ['fresh']);
  } finally { db.close(); }
});

test('a single station is marked with the same window as the list', () => {
  const db = fixture('2027-01-15');
  try {
    const row = db.prepare("SELECT * FROM towers WHERE id='year-permit'").get()!;
    assert.equal(normalizeTower(row, getNewEntryWindow(db)).isNew, true);
    assert.equal(normalizeTower(row, newEntryWindow('2030-05-01')).isNew, false);
  } finally { db.close(); }
});
