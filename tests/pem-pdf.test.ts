import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseAntennaPage,parseSectorAntennaPage,type PdfToken,type PdfLine} from '../server/pemPdf.ts';
import {parseReportLinks,installationReports,pemSourceUrl,isSi2pemPdf,createPemPdfService} from '../server/pemCatalog.ts';
import {openDatabase} from '../server/database.ts';
import type {Tower} from '../src/types.ts';
// Public SI2PEM text geometry, not invented product data:
// /media/28/lab/64706/7083-2026-OS.pdf p3 and /media/reports/BT15647_PEM_OS_2026-09-30-sig_1.pdf p4.
const fixture=(name:string)=>JSON.parse(readFileSync(new URL(`./fixtures/${name}`,import.meta.url),'utf8')) as PdfToken[];
const tower:Tower={id:'uke',stationId:'15809',address:'Warszawa',province:'Mazowieckie',lat:52.231072,lng:20.992275,operators:[],source:'UKE'};
const xs=[28.5,60.7,129.8,243.2,286.7,333.1,385.1,454.1,500.5,566.7];
const ys=[716.5,670.8,617.2,551.3,522.3,493.3,439.7,373.8,320.2,254.3,225.3];
const lines:PdfLine[]=[...xs.map(x=>({x1:x,x2:x,y1:716.5,y2:225.3})),...ys.flatMap(y=>[{x1:129.8,x2:566.7,y1:y,y2:y},...([716.5,670.8,225.3].includes(y)?[{x1:60.7,x2:129.8,y1:y,y2:y}]:[])])];
test('real antenna table preserves nine models, per-band tilts, combined W and source page',()=>{
  const tokens=fixture('pem-networks-tokens.json'),antennas=parseAntennaPage(tokens,lines,['15809'],3);
  assert.equal(antennas.length,9);assert.deepEqual([...new Set(antennas.map(a=>a.azimuth))],[51,190,310]);
  assert.equal(antennas[0].model,'ATR4518R13');assert.equal(antennas[0].manufacturer,'Huawei');assert.equal(antennas[0].eirp,14587);assert.equal(antennas[0].eirpCombined,true);
  assert.deepEqual(antennas[0].settings?.map(s=>s.tilt),[7,7,7,5]);assert.equal(antennas[0].tilt,null);
  assert.equal(antennas[2].height,33.2);assert.equal(antennas[2].tilt,5.5);assert.equal(antennas[2].tiltMin,-2);assert.equal(antennas[2].sourcePage,3);
  assert.equal(parseAntennaPage(tokens,lines,['5809'],3).length,0);
  const split=[...lines,{x1:60.7,x2:129.8,y1:551.3,y2:551.3}];
  const separate=tokens.map(t=>t.s==='15809'?{...t,s:'OTHER'}:t).concat({s:'15809',x:84,y:640,w:22});
  assert.equal(parseAntennaPage(separate,split,['15809'],3).length,2,'merged station ID cell must not leak to another station');
});
test('real sector format reads six sector antennas and excludes the radioline table',()=>{
  const tokens=fixture('pem-sector-tokens.json'),antennas=parseSectorAntennaPage(tokens,['BT15647'],'Stacja BT15647',4);
  assert.equal(antennas.length,6);assert.equal(antennas[0].model,'AVHQB');assert.equal(antennas[0].manufacturer,'Nokia');
  assert.equal(antennas[3].model,'RRVV-65B-R4VB-V2');assert.equal(antennas[3].height,54.1);assert.equal(antennas[3].eirp,28675);assert.equal(antennas[3].tilt,7);
  assert.equal(parseSectorAntennaPage(tokens,['OTHER'],'Stacja BT15647',4).length,0);
});
test('catalogue counts only official report PDFs, deduplicates links, rejects partial IDs and missing URLs',()=>{
  const properties={latitude:tower.lat,longitude:tower.lng,identity_names:'15809',date:'2026-10-12',source:'NetWorks',url:'http://si2pem.gov.pl/media/lab/report.pdf'};
  const data={type:'FeatureCollection',features:[properties,properties,{...properties,url:null},{...properties,url:'https://example.org/report.pdf'},{...properties,identity_names:'115809',url:'https://si2pem.gov.pl/media/wrong.pdf'}].map(properties=>({properties}))};
  const result=parseReportLinks(data,tower);assert.equal(result.reportCount,1);assert.equal(result.reports.length,2);assert.equal(result.partial,false);
  assert.equal(result.reports.find(r=>r.kind==='pdf')?.downloadUrl,'https://si2pem.gov.pl/media/lab/report.pdf');
  assert.equal(pemSourceUrl('javascript:alert(1)'),null);assert.equal(isSi2pemPdf('https://si2pem.gov.pl.evil.test/media/a.pdf'),false);
  const empty=parseReportLinks({type:'FeatureCollection',features:[]},tower);assert.equal(empty.reportCount,0);
});
test('official submission PDFs remain external, only report_file is parsed',()=>{
  const data={results:[{base_station:{id:12,identity_name:'15809',latitude:tower.lat,longitude:tower.lng},registration_date:'19.10.2026',entity:'Orange',report_file:'/media/reports/r.pdf',installation_file:'/media/installations/i.pdf'}]};
  const reports=installationReports(data,tower,'12');assert.deepEqual(reports.map(r=>r.kind),['pdf','external','external']);assert.equal(reports[1].sourceLabel,'Formularz zgłoszenia');assert.equal(reports[2].sourceLabel,'Wyszukiwarka');
  assert.equal(installationReports(data,tower,'13').length,0);
});
test('PDF download resolves a validated catalogue entry and refuses external redirects',async()=>{
  const db=openDatabase(':memory:');let calls=0;
  const entry={id:'abc',number:'x',date:null,laboratory:'',operator:'',stationIds:['15809'],downloadUrl:'https://si2pem.gov.pl/media/report.pdf',kind:'pdf' as const,antennas:[],measurements:[]};
  const catalogue=async()=>({reports:[entry],matchedStations:1,partial:false,checkedAt:new Date().toISOString()});
  const service=createPemPdfService(catalogue,db,(async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://example.org/media/report.pdf'}});}) as typeof fetch);
  try{await assert.rejects(service(tower,'unknown'));assert.equal(calls,0);await assert.rejects(service(tower,'abc'));assert.equal(calls,1);}finally{db.close();}
});
