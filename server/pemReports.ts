import type {Sheet} from 'read-excel-file/node';
import type {DatabaseSync} from 'node:sqlite';
import {createPemCatalogueService} from './pemCatalog.ts';
import {createHash} from 'node:crypto';
import {stationIdentifiers} from './pem.ts';
import type {Tower} from '../src/types.ts';
import type {PemReport,PemAntenna} from '../shared/pem.ts';

const ORIGIN='https://si2pem.gov.pl';
const text=(v:unknown)=>typeof v==='string'?v.trim():typeof v==='number'?String(v):'';
const normalized=(v:unknown)=>text(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l');
const number=(v:unknown)=>{const raw=text(v).replace(',','.');return raw!==''&&Number.isFinite(Number(raw))?Number(raw):null;};
function date(v:unknown){
  if(v instanceof Date&&Number.isFinite(v.getTime()))return v.toISOString().slice(0,10);
  const raw=text(v),match=raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/),iso=match?`${match[3]}-${match[2]}-${match[1]}`:raw;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso)&&Number.isFinite(Date.parse(iso))&&new Date(iso).toISOString().slice(0,10)===iso?iso:null;
}
const hash=(s:string)=>createHash('sha256').update(s).digest('hex').slice(0,18);
export function parseStationReports(sheets:Sheet[],stationId:string,operator:string,downloadUrl:string):PemReport[]{
  const reports=new Map<string,PemReport>();
  for(const sheet of sheets){
    const headerIndex=sheet.data.findIndex(row=>row.some(c=>normalized(c).includes('numer sprawozdania')));
    if(headerIndex<0)continue;
    const headers=sheet.data[headerIndex].map(normalized);
    const col=(name:string)=>headers.findIndex(h=>h.includes(name));
    const reportCol=col('numer sprawozdania'),dateCol=col('data pomiaru'),labCol=col('laboratorium'),pointCol=col('pion pomiarowy'),intensityCol=col('natezenie pola e'),sensitivityCol=col('ponizej czulosci');
    if(dateCol<0||intensityCol<0)continue;
    for(const row of sheet.data.slice(headerIndex+1,headerIndex+15001)){
      const reportNumber=text(row[reportCol]),measuredAt=date(row[dateCol]),lab=text(row[labCol]),intensity=number(row[intensityCol]);
      if(!reportNumber||intensity===null||intensity<0)continue;
      const key=JSON.stringify([reportNumber,measuredAt,lab]);
      if(!reports.has(key))reports.set(key,{id:hash(key),number:reportNumber,date:measuredAt,laboratory:lab,operator,stationIds:[stationId],downloadUrl,antennas:[],measurements:[]});
      reports.get(key)!.measurements.push({point:text(row[pointCol])||String(reports.get(key)!.measurements.length+1),intensity,belowSensitivity:normalized(row[sensitivityCol])==='tak'});
    }
  }
  // Only attach structured antenna rows when the source explicitly identifies their report.
  // Standard public SI2PEM exports currently contain no such worksheet; do not infer antennas from measurements.
  for(const sheet of sheets){
    const hi=sheet.data.findIndex(row=>row.some(c=>normalized(c).includes('azymut'))&&row.some(c=>normalized(c).includes('numer sprawozdania')));
    if(hi<0)continue;
    const headers=sheet.data[hi].map(normalized),col=(key:string)=>headers.findIndex(h=>h.includes(key));
    for(const [i,row] of sheet.data.slice(hi+1,hi+1001).entries()){
      const matches=[...reports.values()].filter(r=>r.number===text(row[col('numer sprawozdania')])&&(!date(row[col('data pomiaru')])||r.date===date(row[col('data pomiaru')])));
      if(matches.length!==1)continue;
      const azimuth=number(row[col('azymut')]),height=number(row[col('wysokosc')]);
      const powerColumn=headers.findIndex(h=>h.includes('eirp')&&/\bw\b/.test(h)&&!h.includes('dbm'));
      const antenna:PemAntenna={id:String(i),azimuth:azimuth!==null&&azimuth>=0&&azimuth<=360?azimuth%360:null,height:height!==null&&height>=0?height:null,model:text(row[col('model')]),manufacturer:text(row[col('producent')]),bands:text(row[col('pasma')]).split(/[,;\s]+/).filter(Boolean),tilt:number(row[col('pochylenie')]),tiltMin:null,tiltMax:null,eirp:powerColumn<0?null:number(row[powerColumn])};
      if(antenna.azimuth!==null||antenna.model||antenna.height!==null)matches[0].antennas.push(antenna);
    }
  }
  return [...reports.values()].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.number.localeCompare(b.number));
}
export function matchPemStations(data:unknown,tower:Tower){
  if(!data||typeof data!=='object'||(data as {type?:unknown}).type!=='FeatureCollection'||!Array.isArray((data as {features?:unknown}).features))throw new Error('Nieprawidłowa odpowiedź SI2PEM.');
  const ids=stationIdentifiers(tower),features=(data as {features:unknown[]}).features;
  return features.flatMap(f=>{
    const feature=f as {id?:unknown;geometry?:{coordinates?:unknown[]};properties?:Record<string,unknown>};
    const p=feature?.properties,id=text(feature?.id).match(/^extend_base_stations\.(\d+)$/)?.[1],coords=feature?.geometry?.coordinates;
    if(!p||!id||!coords)return [];
    const stationId=text(p.identity_name),lat=number(coords[1]),lng=number(coords[0]);
    if(!ids.includes(stationId.toUpperCase())||lat===null||lng===null||Math.hypot((lat-tower.lat)*111320,(lng-tower.lng)*111320*Math.cos(tower.lat*Math.PI/180))>300)return [];
    return [{id,stationId,operator:text(p.operator_name)}];
  }).slice(0,8);
}
export function createPemReportsService(fetcher:typeof fetch=fetch,db?:DatabaseSync){
  return createPemCatalogueService(fetcher,db);
}
