import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/database.ts';
import {getTowerHistory, UNKNOWN_DATE} from '../server/towerHistory.ts';

test('timeline entries without a known date say so instead of carrying a placeholder date', () => {
  const db = openDatabase(':memory:');
  try {
    const operators = [{name: 'Play', stationIds: ['WAW0001'], bands: [
      {tech: 'LTE', band: '1800', permit: 'REJ/1/5/1/23 [P] - expires 2099-12-31'},
      {tech: 'LTE', band: '800', permit: 'DECYZJA-BEZ-ROKU'},
    ]}];
    db.prepare("INSERT INTO towers(id,stationId,address,province,lat,lng,operators,source,addedBy,status,createdAt) VALUES('UKE_x','WAW0001','Warszawa','Mazowieckie',52.2,21.0,?,'UKE','Import KML','APPROVED',NULL)").run(JSON.stringify(operators));
    db.prepare("INSERT INTO comments(id,towerId,userNick,text,createdAt) VALUES('c1','UKE_x','Tester','Stoi przy drodze','2027-02-03T10:15:00.000Z'),('c2','UKE_x','Tester','Bez daty','kiedyś')").run();
    db.prepare("INSERT INTO pem_reports_cache(key,tower,data,checkedAt) VALUES('k',?,?,1)").run(
      JSON.stringify({id: 'UKE_x'}),
      JSON.stringify({reports: [{id: 'r1', date: '2025-06-30', number: 'LAB/1/2025', laboratory: 'Lab'}, {id: 'r2', number: 'LAB/2', laboratory: 'Lab'}]}),
    );

    const history = getTowerHistory(db, 'UKE_x')!;
    const today = new Date().toISOString().slice(0, 10);
    const byId = Object.fromEntries(history.events.map(e => [e.id, e]));

    // Known dates are kept exactly.
    assert.equal(byId['comment-c1'].dateGroup, '2027-02-03');
    assert.equal(byId['pem-report-r1'].dateGroup, '2025-06-30');
    assert.equal(byId['uke-permit-' + history.uke.permits.find(p => p.decisionYear === 2023)!.permitId].dateGroup, '2023');

    // Unknown dates are marked as unknown: no fixed fallback, no "today".
    const unknown = history.events.filter(e => e.dateGroup === UNKNOWN_DATE);
    assert.deepEqual(unknown.map(e => e.id).sort(), ['comment-c2', 'pem-report-r2', 'reg-UKE_x', 'uke-permit-' + history.uke.permits.find(p => !p.decisionYear)!.permitId].sort());
    assert.ok(unknown.every(e => e.createdAt === ''));
    assert.equal(history.createdAt, '');
    const serialized = JSON.stringify(history);
    assert.doesNotMatch(serialized, /2026-10-10|2024-01-01/);
    assert.ok(!history.events.some(e => e.dateGroup === today || e.createdAt.startsWith(today)));

    // Dated entries come first, newest on top; undated ones follow.
    const order = history.events.map(e => e.dateGroup);
    assert.deepEqual(order.slice(0, 3), ['2027-02-03', '2025-06-30', '2023']);
    assert.ok(order.slice(3).every(group => group === UNKNOWN_DATE));
    assert.equal(history.updatedAt, '2027-02-03T10:15:00.000Z');
  } finally { db.close(); }
});
