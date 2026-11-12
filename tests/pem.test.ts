import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPemService,parsePem,pemRequest,stationIdentifiers} from '../server/pem.ts';
import type {Tower} from '../src/types.ts';

// Synthetic measurements exercise matching rules; never used as product data.
const tower:Tower={id:'fixture',stationId:'9541',address:'Stacja testowa',province:'Mazowieckie',lat:52.244167,lng:20.881944,source:'UKE',operators:[{name:'Orange',stationIds:['9541'],bands:[]},{name:'Play',stationIds:['WAR1515'],bands:[]}]};
const feature=(id:string,change:Record<string,unknown>={})=>({id,properties:{latitude:52.2442,longitude:20.882,intensity:2.5,date:'2025-02-01',number:'12',identity_names:'9541',source:'Laboratorium testowe',url:'/media/reports/test.pdf',...change}});
test('PEM matches complete station identities and distance, preserving zero and sensitivity',()=>{
  const result=parsePem({type:'FeatureCollection',features:[feature('good'),feature('zero',{identity_names:'WAR1515, OTHER',intensity:0,below_sensitivity:true,date:'2026-01-01'}),feature('wrong',{identity_names:'19541'}),feature('far',{latitude:52.3}),feature('invalid',{intensity:null}),feature('good')]},tower,stationIdentifiers(tower));
  assert.deepEqual(result.items.map(p=>p.id),['zero','good']);assert.equal(result.items[0].intensity,0);assert.equal(result.items[0].belowSensitivity,true);
  assert.ok(result.items.every(p=>p.distance<1000));assert.deepEqual(new Set(result.matchedIds),new Set(['9541','WAR1515']));
});
test('PEM bounds requests and escapes station identifiers in CQL',()=>{
  const url=new URL(pemRequest(tower,["O'NEIL_1%"]));
  assert.equal(url.origin,'https://si2pem.gov.pl');assert.equal(url.searchParams.get('maxFeatures'),'501');
  assert.ok(url.searchParams.get('CQL_FILTER')!.includes("O''NEIL\\_1\\%"));assert.ok(url.searchParams.get('CQL_FILTER')!.includes('BBOX(geom,'));
  assert.throws(()=>pemRequest({...tower,lat:Infinity},['9541']));
});
test('PEM does not turn upstream errors into empty measurements and only links official reports',()=>{
  assert.throws(()=>parsePem({error:'unavailable'},tower,['9541']));
  const result=parsePem({type:'FeatureCollection',features:[feature('a',{url:'javascript:alert(1)'}),feature('b',{url:'https://other.example/report.pdf'}),feature('c')]},tower,['9541']);
  assert.equal(result.items.find(p=>p.id==='a')!.reportUrl,null);assert.equal(result.items.find(p=>p.id==='b')!.reportUrl,null);
  assert.equal(result.items.find(p=>p.id==='c')!.reportUrl,'https://si2pem.gov.pl/media/reports/test.pdf');
});
test('PEM shares pending requests, caches success and retries failures',async()=>{
  let requests=0;
  const service=createPemService((async()=>{requests++;return Response.json({type:'FeatureCollection',features:[feature('a')]});}) as typeof fetch);
  const [a,b]=await Promise.all([service(tower),service(tower)]);assert.deepEqual(a,b);await service(tower);assert.equal(requests,1);
  let attempts=0;
  const failing=createPemService((async()=>{attempts++;return Response.json({}, {status:503});}) as typeof fetch);
  await assert.rejects(failing(tower));await assert.rejects(failing(tower));assert.equal(attempts,2);
  await assert.rejects(service({...tower,stationId:undefined,operators:[]}));
});
