import type {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import type {Tower} from '../src/types.ts';
import type {PemReport,PemReportsResult} from '../shared/pem.ts';
import {SI2PEM_REFRESH_MS} from '../shared/pemPlans.ts';
import {pemRequest,stationIdentifiers} from './pem.ts';
import {readPemPdf} from './pemPdf.ts';
import {operatorName} from '../shared/operators.ts';

const ORIGIN='https://si2pem.gov.pl';
const string=(v:unknown)=>typeof v==='string'?v.trim():'';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex').slice(0,24);
const matches=(value:string,id:string)=>new RegExp(`(^|[^\\p{L}\\p{N}_-])${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}($|[^\\p{L}\\p{N}_-])`,'iu').test(value);
const decoded=(value:string)=>{try{return decodeURIComponent(value);}catch{return value;}};
const normalizedOperator=(value:string)=>value.trim().normalize('NFKC').toLocaleLowerCase('pl-PL');
const sameOperator=(left:string,right:string)=>{
  const a=operatorName(left),b=operatorName(right);
  return a==='Inne'||b==='Inne'?normalizedOperator(left)===normalizedOperator(right):a===b;
};
export function pemSourceUrl(value:unknown){
  const raw=string(value);if(!raw||raw.length>3000)return null;
  try{
    const url=new URL(raw,ORIGIN);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;
    if(url.hostname==='si2pem.gov.pl'&&!url.port)url.protocol='https:';
    url.hash='';return url.href;
  }catch{return null;}
}
export function isSi2pemPdf(value:string){
  try{const url=new URL(value);return url.origin===ORIGIN&&url.pathname.startsWith('/media/')&&/\.pdf$/i.test(url.pathname);}catch{return false;}
}
export function parseReportLinks(data:unknown,tower:Tower):PemReportsResult{
  const raw=data as {type?:unknown;features?:{properties?:Record<string,unknown>}[];totalFeatures?:unknown};
  if(!raw||raw.type!=='FeatureCollection'||!Array.isArray(raw.features))throw new Error('Nieprawidłowa lista raportów SI2PEM.');
  const ids=stationIdentifiers(tower),reports=new Map<string,PemReport>(),matched=new Set<string>();
  for(const feature of raw.features){
    const p=feature?.properties;if(!p||typeof p.latitude!=='number'||typeof p.longitude!=='number')continue;
    const sourceOperator=string(p.operator_name||p.operatorName||p.operator),selectedOperator=tower.operators.length===1?tower.operators[0].name:'';
    if(sourceOperator&&selectedOperator&&!sameOperator(sourceOperator,selectedOperator))continue;
    const distance=Math.hypot((p.latitude-tower.lat)*111320,(p.longitude-tower.lng)*111320*Math.cos(tower.lat*Math.PI/180));
    const stationIds=ids.filter(id=>matches(string(p.identity_names),id));if(distance>1000||!stationIds.length)continue;
    stationIds.forEach(id=>matched.add(id));const url=pemSourceUrl(p.url);if(!url)continue;
    const date=string(p.date),validDate=/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date?date:null;
    let report=reports.get(url);
    if(!report){
      const source=new URL(url),pdf=isSi2pemPdf(url),label=pdf?'PDF SI2PEM':/wyszuk|search/i.test(source.href)?'Wyszukiwarka':/formularz|submission|form\b/i.test(source.pathname)?'Formularz zgłoszenia':'Strona źródłowa';
      report={id:hash(url),number:decoded(source.pathname.split('/').pop()||'').replace(/\.pdf$/i,'')||source.hostname,date:validDate,laboratory:string(p.source),operator:tower.operators.map(o=>o.name).join(' · '),stationIds,downloadUrl:url,kind:pdf?'pdf':'external',sourceLabel:label,antennas:[],measurements:[]};reports.set(url,report);
    }else{
      if(validDate&&(!report.date||validDate>report.date))report.date=validDate;
      report.stationIds=[...new Set([...report.stationIds,...stationIds])];
    }
    if(typeof p.intensity==='number'&&Number.isFinite(p.intensity)&&p.intensity>=0)report.measurements.push({point:string(p.number)||String(report.measurements.length+1),intensity:p.intensity,belowSensitivity:p.below_sensitivity===true});
  }
  return {reports:[...reports.values()].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.id.localeCompare(b.id)),reportCount:[...reports.values()].filter(r=>r.kind==='pdf').length,matchedStations:matched.size,partial:Number(raw.totalFeatures)>raw.features.length,checkedAt:new Date().toISOString(),catalogVersion:2};
}
export function installationReports(data:unknown,tower:Tower,sourceId:string):PemReport[]{
  const raw=data as {results?:Record<string,unknown>[]};if(!raw||!Array.isArray(raw.results))throw new Error('Nieprawidłowe zgłoszenia SI2PEM.');
  const ids=stationIdentifiers(tower),entries:PemReport[]=[];
  for(const row of raw.results){
    const station=row.base_station as Record<string,unknown>|undefined;if(!station||String(station.id)!==sourceId)continue;
    const sid=string(station.identity_name),lat=Number(station.latitude),lng=Number(station.longitude);
    const sourceOperator=string(station.operator),selectedOperator=tower.operators.length===1?tower.operators[0].name:'';
    if(sourceOperator&&selectedOperator&&!sameOperator(sourceOperator,selectedOperator))continue;
    if(!ids.includes(sid.toUpperCase())||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.hypot((lat-tower.lat)*111320,(lng-tower.lng)*111320*Math.cos(tower.lat*Math.PI/180))>300)continue;
    const dm=string(row.registration_date||row.published_at).slice(0,10).match(/^(\d{2})\.(\d{2})\.(\d{4})$/),candidate=dm?`${dm[3]}-${dm[2]}-${dm[1]}`:null;
    const date=candidate&&Number.isFinite(Date.parse(candidate))&&new Date(candidate).toISOString().slice(0,10)===candidate?candidate:null;
    const base={date,laboratory:string(row.report_laboratory)||string(row.entity),operator:string(station.operator),stationIds:[sid],antennas:[],measurements:[]};
    for(const [field,label] of [['report_file','PDF SI2PEM'],['installation_file','Formularz zgłoszenia']] as const){
      const url=pemSourceUrl(row[field]);if(!url)continue;
      const pdf=field==='report_file'&&isSi2pemPdf(url);
      entries.push({...base,id:hash(url),number:string(row.report)||string(row.reference_no)||sid,downloadUrl:url,kind:pdf?'pdf':'external',sourceLabel:pdf?'PDF SI2PEM':label});
    }
    const searchUrl=`${ORIGIN}/all_installation_info/?base_station_id=${sourceId}`;
    entries.push({...base,id:hash(searchUrl),number:sid,downloadUrl:searchUrl,kind:'external',sourceLabel:'Wyszukiwarka'});
  }
  return entries;
}
async function bytes(response:Response,limit:number){
  if(!response.ok||!response.body){await response.body?.cancel();throw new Error('SI2PEM nie udostępnił dokumentu.');}
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let total=0;
  try{while(true){const row=await reader.read();if(row.done)break;total+=row.value.length;if(total>limit)throw new Error('Dokument przekracza limit rozmiaru.');parts.push(row.value);}}finally{await reader.cancel();}
  return Buffer.concat(parts);
}
export function createPemCatalogueService(fetcher:typeof fetch=fetch,db?:DatabaseSync){
  const cache=new Map<string,PemReportsResult>(),pending=new Map<string,Promise<PemReportsResult>>();
  return async(tower:Tower,fresh=false):Promise<PemReportsResult>=>{
    const ids=stationIdentifiers(tower);if(!ids.length)throw new Error('Brak identyfikatora stacji.');
    const selectedOperator=tower.operators[0]?.name||'UKE',key=JSON.stringify([tower.id,tower.lat,tower.lng,selectedOperator,ids]),memory=cache.get(key);
    if(!fresh&&memory&&Date.parse(memory.checkedAt)+SI2PEM_REFRESH_MS>Date.now())return memory;
    const saved=db?.prepare('SELECT data,checkedAt FROM pem_reports_cache WHERE key=?').get(key);
    const old=saved?JSON.parse(String(saved.data)) as PemReportsResult:null;
    if(!fresh&&old&&Number(saved!.checkedAt)+SI2PEM_REFRESH_MS>Date.now())return old;
    if(pending.has(key))return old&&!fresh?old:pending.get(key)!;
    const request=(async()=>{
      const url=new URL(pemRequest(tower,ids));url.searchParams.set('maxFeatures','20001');
      url.searchParams.set('propertyName','latitude,longitude,identity_names,date,url,source,number,intensity,below_sensitivity');
      url.searchParams.set('CQL_FILTER',url.searchParams.get('CQL_FILTER')!.replace(' AND is_old=false',''));
      const readJson=async(target:URL|string)=>JSON.parse(new TextDecoder().decode(await bytes(await fetcher(target,{signal:AbortSignal.timeout(18000),headers:{Accept:'application/json'}}),8*1024*1024)));
      const stationUrl=new URL(pemRequest(tower,ids));stationUrl.searchParams.set('typeName','public:extend_base_stations');stationUrl.searchParams.delete('sortBy');stationUrl.searchParams.set('maxFeatures','64');
      stationUrl.searchParams.set('CQL_FILTER',stationUrl.searchParams.get('CQL_FILTER')!.replace(' AND is_old=false','').replaceAll('identity_names','identity_name'));
      const upstream=await Promise.allSettled([readJson(url).then(d=>parseReportLinks(d,tower)),readJson(stationUrl)]);
      if(upstream.every(r=>r.status==='rejected'))throw new Error('Nie udało się wczytać odnośników SI2PEM.');
      const value:PemReportsResult=upstream[0].status==='fulfilled'?upstream[0].value:{reports:[],reportCount:0,partial:true,matchedStations:0,checkedAt:new Date().toISOString(),catalogVersion:2};
      value.partial ||=upstream.some(r=>r.status==='rejected');
      const discovered=upstream[1].status==='fulfilled'?upstream[1].value as {type?:unknown;features?:{id?:string;properties?:Record<string,unknown>;geometry?:{coordinates?:number[]}}[]}:null;
      if(discovered){
        if(discovered.type!=='FeatureCollection'||!Array.isArray(discovered.features))throw new Error('Nieprawidłowa odpowiedź stacji SI2PEM.');
        const sources=discovered.features.flatMap(f=>{
          const sid=string(f.properties?.identity_name),sourceOperator=string(f.properties?.operator_name||f.properties?.operator),selectedOperator=tower.operators[0]?.name||'',coords=f.geometry?.coordinates,sourceId=f.id?.match(/^extend_base_stations\.(\d+)$/)?.[1];
          return sourceId&&coords&&ids.includes(sid.toUpperCase())&&(!sourceOperator||!selectedOperator||sameOperator(sourceOperator,selectedOperator))&&Math.hypot((coords[1]-tower.lat)*111320,(coords[0]-tower.lng)*111320*Math.cos(tower.lat*Math.PI/180))<=300?[sourceId]:[];
        }).slice(0,8);
        value.matchedStations=Math.max(value.matchedStations,sources.length);
        const installations=await Promise.allSettled(sources.map(async sourceId=>{
          const entries:PemReport[]=[];
          for(let page=1;page<=10;page++){
            const data=await readJson(`${ORIGIN}/api/all_installation_info/?base_station_id=${sourceId}&page_size=100&page=${page}`) as {count?:number;results?:unknown[];next?:unknown};
            entries.push(...installationReports(data,tower,sourceId));
            if(!data.next)break;if(page===10)value.partial=true;
          }
          return entries;
        }));
        value.partial ||=installations.some(r=>r.status==='rejected');
        for(const entry of installations)if(entry.status==='fulfilled')value.reports.push(...entry.value);
      }
      const unique=new Map<string,PemReport>();
      for(const entry of value.reports){const prior=unique.get(entry.downloadUrl);if(!prior)unique.set(entry.downloadUrl,entry);else if(entry.date&&(!prior.date||entry.date>prior.date)){prior.date=entry.date;}}
      value.reports=[...unique.values()].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.id.localeCompare(b.id));value.reportCount=value.reports.filter(r=>r.kind==='pdf').length;
      db?.prepare('INSERT OR REPLACE INTO pem_reports_cache(key,tower,data,checkedAt) VALUES(?,?,?,?)').run(key,JSON.stringify(tower),JSON.stringify(value),Date.now());
      const operator=tower.operators[0]?.name||'UKE';
      db?.prepare('INSERT OR REPLACE INTO pem_report_operator_counts(towerId,operator,count,partial,checkedAt) VALUES(?,?,?,?,?)').run(tower.id,operator,value.reportCount,value.partial?1:0,value.checkedAt);
      if(cache.size>=60)cache.delete(cache.keys().next().value!);cache.set(key,value);return value;
    })();
    pending.set(key,request);void request.finally(()=>pending.delete(key)).catch(()=>{});
    return old&&!fresh?old:request;
  };
}
export function createPemPdfService(catalogue:ReturnType<typeof createPemCatalogueService>,db:DatabaseSync,fetcher:typeof fetch=fetch){
  const pending=new Map<string,Promise<PemReport>>();let active=0;const waiting:(()=>void)[]=[];
  return async(tower:Tower,reportId:string):Promise<PemReport>=>{
    const entry=(await catalogue(tower)).reports.find(r=>r.id===reportId);
    if(!entry||entry.kind!=='pdf'||!isSi2pemPdf(entry.downloadUrl))throw new Error('Ten odnośnik otwórz bezpośrednio w przeglądarce.');
    const key=hash(JSON.stringify([entry.downloadUrl,entry.stationIds,entry.operator])),saved=db.prepare('SELECT data,checkedAt FROM pem_pdf_cache WHERE key=?').get(key);
    if(saved&&Number(saved.checkedAt)+SI2PEM_REFRESH_MS>Date.now())return {...entry,...JSON.parse(String(saved.data)) as PemReport};
    if(pending.has(key))return pending.get(key)!;
    if(active>=2&&waiting.length>=8)throw new Error('Trwa odczyt innych PDF. Spróbuj ponownie za chwilę.');
    const task=(async()=>{
      if(active>=2)await new Promise<void>(resolve=>waiting.push(resolve));else active++;
      try{
        let url=entry.downloadUrl,response:Response|undefined;
        for(let i=0;i<4;i++){
          if(!isSi2pemPdf(url))throw new Error('Nieprawidłowy adres PDF SI2PEM.');
          response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(25000),headers:{Accept:'application/pdf'}});
          if(![301,302,303,307,308].includes(response.status))break;
          url=new URL(response.headers.get('location')||'',url).href;await response.body?.cancel();response=undefined;
        }
        if(!response)throw new Error('Nie udało się pobrać PDF SI2PEM.');
        const data=await bytes(response,20*1024*1024);if(data.subarray(0,5).toString()!=='%PDF-')throw new Error('Źródło nie zwróciło pliku PDF.');
        const result=await readPemPdf(data,entry);
        db.prepare('INSERT OR REPLACE INTO pem_pdf_cache(key,data,checkedAt) VALUES(?,?,?)').run(key,JSON.stringify(result),Date.now());
        return result;
      }finally{const next=waiting.shift();if(next)next();else active--;}
    })();
    pending.set(key,task);void task.finally(()=>pending.delete(key)).catch(()=>{});return task;
  };
}
