import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Sheet} from 'read-excel-file/node';
import type {Tower} from '../src/types.ts';
import {matchPemStations,parseStationReports} from '../server/pemReports.ts';

const tower:Tower={id:'synthetic',stationId:'3799',lat:52.234444,lng:21.014444,address:'Test',province:'Mazowieckie',source:'UKE',operators:[{name:'Orange',bands:[]}]};
const measurements:Sheet={sheet:'Pomiary szerokopasmowe',data:[['Pion pomiarowy','Natężenie pola E [V/m]','Czy poniżej czułości miernika?','Data pomiaru','Nazwa laboratorium (Nr akredytacji)','Numer sprawozdania'],['1',0,'TAK','02.10.2025','Laboratorium testowe','R1'],['2',2.5,null,'02.10.2025','Laboratorium testowe','R1'],['3',3,null,'02.10.2025','Laboratorium testowe','R2'],['4',null,null,'02.10.2025','Laboratorium testowe','R2']]};
test('PEM reports count distinct actual report numbers, not points or dates',()=>{
  const reports=parseStationReports([measurements],'3799','Orange','https://si2pem.gov.pl/base_station/1/report/');
  assert.equal(reports.length,2);assert.equal(reports[0].date,'2025-10-02');
  const first=reports.find(r=>r.number==='R1')!;assert.equal(first.measurements.length,2);assert.equal(first.measurements[0].intensity,0);assert.equal(first.measurements[0].belowSensitivity,true);
  assert.deepEqual(first.antennas,[]);assert.equal(reports.find(r=>r.number==='R2')!.measurements.length,1);
});
test('PEM never infers antennas and only uses report-associated source columns',()=>{
  const antennas:Sheet={sheet:'Anteny',data:[['Numer sprawozdania','Azymut','Wysokość','Model','Pasma','Pochylenie','EIRP [W]'],['R1',37,50,'Model testowy','700 900',7,17401],['OTHER',160,45,'Niepowiązany','1800',3,500],['R2',400,40,'Model bez azymutu','900',null,null]]};
  const result=parseStationReports([measurements,antennas],'3799','Orange','https://si2pem.gov.pl/base_station/1/report/');
  const antenna=result.find(r=>r.number==='R1')!.antennas[0];assert.equal(antenna.azimuth,37);assert.equal(antenna.height,50);assert.equal(antenna.eirp,17401);assert.deepEqual(antenna.bands,['700','900']);
  assert.equal(result.find(r=>r.number==='R2')!.antennas[0].azimuth,null);
  assert.equal(result.flatMap(r=>r.antennas).length,2);
});
test('PEM station lookup validates complete ID, local coordinates and official feature identity',()=>{
  const feature=(id:string,name:string,coords:number[])=>({id,geometry:{coordinates:coords},properties:{identity_name:name,operator_name:'Orange'}});
  const result=matchPemStations({type:'FeatureCollection',features:[feature('extend_base_stations.1','3799',[21.0145,52.2345]),feature('extend_base_stations.2','13799',[21.0145,52.2345]),feature('extend_base_stations.3','3799',[20,51]),feature('malformed','3799',[21.0145,52.2345])]},tower);
  assert.deepEqual(result.map(s=>s.id),['1']);assert.throws(()=>matchPemStations({},tower));
});
