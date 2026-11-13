import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/database.ts';
import {getTowerHistory, UNKNOWN_DATE} from '../server/towerHistory.ts';

test('the timeline lists only changes made in the BTMap database, with unknown dates said so', () => {
  const db = openDatabase(':memory:');
  try {
    const operators = [{name: 'Play', stationIds: ['WAW0001'], bands: [
      {tech: 'LTE', band: '1800', permit: 'REJ/1/5/1/23 [P] - expires 2099-12-31'},
    ]}];
    db.prepare("INSERT INTO towers(id,stationId,address,province,lat,lng,operators,source,addedBy,status,createdAt) VALUES('BTMAP_x','WAW0001','Warszawa','Mazowieckie',52.2,21.0,?,'BTMAP','Anna','APPROVED',NULL)").run(JSON.stringify(operators));
    db.prepare("INSERT INTO comments(id,towerId,userNick,text,createdAt) VALUES('c1','BTMAP_x','Tester','Stoi przy drodze','2027-02-03T10:15:00.000Z'),('c2','BTMAP_x','Tester','Bez daty','kiedyś')").run();
    db.prepare("INSERT INTO tower_history(id,towerId,userNick,changeType,title,createdAt) VALUES('h1','BTMAP_x','Anna','UPDATED','Poprawiono adres','2027-01-10T08:00:00.000Z')").run();
    db.prepare("INSERT INTO pem_reports_cache(key,tower,data,checkedAt) VALUES('k',?,?,1)").run(
      JSON.stringify({id: 'BTMAP_x'}),
      JSON.stringify({reports: [{id: 'r1', date: '2025-06-30', number: 'LAB/1/2025', laboratory: 'Lab'}]}),
    );

    const history = getTowerHistory(db, 'BTMAP_x')!;
    const today = new Date().toISOString().slice(0, 10);
    const ids = history.events.map(e => e.id);

    // Only the station's own changes in BTMap: no UKE permits, no SI2PEM reports.
    assert.ok(!ids.some(id => id.startsWith('uke-permit-') || id.startsWith('pem-report-')));
    assert.deepEqual(history.events.map(e => e.dateGroup).slice(0, 2), ['2027-02-03', '2027-01-10']);

    // Unknown dates are marked as unknown: no fixed fallback, no "today".
    const unknown = history.events.filter(e => e.dateGroup === UNKNOWN_DATE);
    assert.deepEqual(unknown.map(e => e.id).sort(), ['comment-c2', 'reg-BTMAP_x']);
    assert.ok(unknown.every(e => e.createdAt === ''));
    assert.ok(!history.events.some(e => e.dateGroup === today || e.createdAt.startsWith(today)));
    assert.equal(history.updatedAt, '2027-02-03T10:15:00.000Z');
  } finally { db.close(); }
});

test('a UKE registry station has no BTMap timeline', () => {
  const db = openDatabase(':memory:');
  try {
    db.prepare("INSERT INTO towers(id,stationId,address,province,lat,lng,operators,source,addedBy,status,createdAt) VALUES('UKE_x','WAW0001','Warszawa','Mazowieckie',52.2,21.0,'[]','UKE','AutoSync BIP UKE','APPROVED','2026-11-13T10:00:00.000Z')").run();
    assert.deepEqual(getTowerHistory(db, 'UKE_x')!.events, []);
  } finally { db.close(); }
});
