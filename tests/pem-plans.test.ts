import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/database.ts';
import {createPemPlansService,parsePlan,retentionCutoff} from '../server/pemPlans.ts';
import {createPemReportsService} from '../server/pemReports.ts';
import {SI2PEM_REFRESH_MS} from '../shared/pemPlans.ts';
import type {Tower} from '../src/types.ts';
import {withPemCounts,getTowers} from '../server/query.ts';

const row=(id=1,extra:Record<string,unknown>={})=>({id,base_station:{identity_name:'3799',operator:'Orange Polska S.A.',latitude:'52.234444',longitude:'21.014444',address:'Plac Powstańców Warszawy 2',city:'Warszawa',voivodeship:'mazowieckie'},lab:{name:'Laboratorium źródłowe',PCA:'AB 419'},date_from:'12.10.2026',date_to:'16.10.2026',status:'PLANNED',report:null,...extra});
const area={minLat:52,maxLat:53,minLng:20,maxLng:22};
test('SI2PEM plans retain official lab, operator, dates and validated source links',()=>{
  const plan=parsePlan(row(1,{status:'COMPLETED',report:'/media/report.pdf'}),'2026-10-12')!;
  assert.equal(plan.lab,'Laboratorium źródłowe');assert.equal(plan.dateFrom,'2026-10-12');assert.equal(plan.dateTo,'2026-10-16');assert.equal(plan.operator,'Orange');assert.equal(plan.status,'COMPLETED');assert.equal(plan.reportUrl,'https://si2pem.gov.pl/media/report.pdf');
  assert.equal(parsePlan(row(2,{date_to:'31.02.2026'}),'2026-01-01'),null);
  assert.equal(parsePlan(row(3,{status:'CANCELED'}),'2026-10-12'),null);
  assert.equal(parsePlan(row(4,{report:'https://other.invalid/report.pdf'}),'2026-10-12')!.reportUrl,null);
  assert.equal(parsePlan(row(5,{base_station:{latitude:null,longitude:21}}),'2026-10-12'),null);
});
test('seven-day expiry uses Warsaw calendar days, including daylight saving transitions',()=>{
  assert.equal(retentionCutoff(new Date('2026-10-19T21:59:59Z')),'2026-10-12');
  assert.equal(retentionCutoff(new Date('2026-10-19T22:00:00Z')),'2026-10-13');
  assert.equal(retentionCutoff(new Date('2026-10-26T22:59:59Z')),'2026-10-19');
  assert.equal(retentionCutoff(new Date('2026-10-26T23:00:00Z')),'2026-10-20');
});
test('sync imports every page atomically, keeps saved data after failure, and respects the 48-hour schedule across restart',async()=>{
  const db=openDatabase(':memory:');let now=new Date('2026-10-19T10:00:00Z'),fail=false;const calls:number[]=[];
  const fetcher=(async(url:unknown)=>{
    const page=Number(new URL(String(url)).searchParams.get('page'));calls.push(page);
    if(fail&&page===2)return new Response('unavailable',{status:503});
    return Response.json({count:101,results:page===1?[row(1),row(2,{date_to:'12.10.2026'}),row(3,{date_to:'11.10.2026',date_from:'10.10.2026'}),row(4,{status:'CANCELED'})]:[row(101,{status:'COMPLETED'})]});
  }) as typeof fetch;
  try{
    const service=createPemPlansService(db,fetcher,()=>now);assert.equal(service.due(),true);await service.sync();
    assert.deepEqual(calls.sort(),[1,2]);assert.equal(service.query(area).total,3);assert.equal(service.query({...area,operators:'Play'}).total,0);
    assert.equal(createPemPlansService(db,fetcher,()=>now).due(),false);
    now=new Date(now.getTime()+SI2PEM_REFRESH_MS);assert.equal(service.due(),true);
    fail=true;await assert.rejects(service.sync());
    const result=service.query(area);assert.equal(result.total,2);assert.equal(result.stale,true);assert.ok(result.error);assert.equal(service.due(),false);
    now=new Date(now.getTime()+15*60000);assert.equal(service.due(),true);
    assert.throws(()=>service.query({...area,minLat:'bad'}));
  }finally{db.close();}
});
test('station report cache persists between service instances for two days',async()=>{
  const db=openDatabase(':memory:');const tower:Tower={id:'uke',stationId:'3799',address:'Warszawa',province:'Mazowieckie',lat:52.23,lng:21.01,operators:[],source:'UKE'};
  const key=JSON.stringify([tower.id,tower.lat,tower.lng,'UKE',['3799']]),data={reports:[],matchedStations:0,partial:false,checkedAt:new Date().toISOString()};
  let requests=0;const fetcher=(async()=>{requests++;throw new Error('source unavailable');}) as typeof fetch;
  try{
    db.prepare('INSERT INTO pem_reports_cache VALUES(?,?,?,?)').run(key,JSON.stringify(tower),JSON.stringify(data),Date.now());
    assert.deepEqual(await createPemReportsService(fetcher,db)(tower),data);assert.equal(requests,0);
    db.prepare('UPDATE pem_reports_cache SET checkedAt=?').run(Date.now()-SI2PEM_REFRESH_MS-1);
    await assert.rejects(createPemReportsService(fetcher,db)(tower,true));assert.equal(requests,2);
  }finally{db.close();}
});

test('SI2PEM counts stay attached to their operator and unknown remains distinct from zero',()=>{
  const db=openDatabase(':memory:');
  try{
    db.prepare("INSERT INTO towers(id,address,lat,lng,source,status) VALUES('known','A',52,21,'UKE','APPROVED'),('unknown','B',52,21,'UKE','APPROVED')").run();
    db.prepare('INSERT INTO pem_report_operator_counts VALUES(?,?,?,?,?)').run('known','Plus',2,0,'2026-10-19T12:00:00Z');
    const result=getTowers(db,{});
    assert.equal((result.items[0] as any).pemReportsByOperator?.Plus.count,2);assert.equal('pemReportsByOperator' in result.items[1],false);
    assert.equal((withPemCounts(db,[{id:'known'}]) as any)[0].pemReportsByOperator?.Plus.count,2);
  }finally{db.close();}
});

test('expired saved reports are returned immediately while one shared source refresh runs',async()=>{
  const db=openDatabase(':memory:');const tower:Tower={id:'uke',stationId:'3799',address:'Warszawa',province:'Mazowieckie',lat:52.23,lng:21.01,operators:[],source:'UKE'};
  const key=JSON.stringify([tower.id,tower.lat,tower.lng,'UKE',['3799']]);
  const old={reports:[],matchedStations:0,partial:false,checkedAt:'2026-01-01T00:00:00Z'};
  let release!:(value:Response)=>void,calls=0;
  const response=new Promise<Response>(resolve=>{release=resolve;});
  const fetcher=(async()=>{calls++;return (await response).clone();}) as typeof fetch;
  try{
    db.prepare('INSERT INTO pem_reports_cache VALUES(?,?,?,?)').run(key,JSON.stringify(tower),JSON.stringify(old),0);
    const service=createPemReportsService(fetcher,db);
    assert.deepEqual(await service(tower),old);assert.deepEqual(await service(tower),old);assert.equal(calls,2);
    const refreshed=service(tower,true);release(Response.json({type:'FeatureCollection',features:[]}));
    assert.notEqual((await refreshed).checkedAt,old.checkedAt);assert.equal(calls,2);
    assert.equal(db.prepare("SELECT count FROM pem_report_operator_counts WHERE towerId='uke' AND operator='UKE'").get()!.count,0);
  }finally{db.close();}
});
