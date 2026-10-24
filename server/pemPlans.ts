import type {DatabaseSync} from 'node:sqlite';
import {SI2PEM_REFRESH_MS,type PemPlan,type PemPlansResult} from '../shared/pemPlans.ts';
import {operatorName} from '../shared/operators.ts';

const ORIGIN='https://si2pem.gov.pl',PAGE_SIZE=100,MAX_PAGES=1000;
const str=(v:unknown)=>typeof v==='string'?v.trim():'';
export function planDate(v:unknown){
  const value=str(v),m=value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const iso=m?`${m[3]}-${m[2]}-${m[1]}`:value;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso)&&Number.isFinite(Date.parse(iso))&&new Date(iso).toISOString().slice(0,10)===iso?iso:null;
}
export function retentionCutoff(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value=(key:string)=>parts.find(p=>p.type===key)!.value;
  return new Date(Date.parse(`${value('year')}-${value('month')}-${value('day')}T00:00:00Z`)-7*86400000).toISOString().slice(0,10);
}
export const planOperator=operatorName;
export function parsePlan(value:unknown,cutoff:string):PemPlan|null{
  if(!value||typeof value!=='object')return null;
  const p=value as Record<string,unknown>,bs=p.base_station as Record<string,unknown>|null,lab=p.lab as Record<string,unknown>|null;
  if(!bs||!lab||!Number.isSafeInteger(p.id)||Number(p.id)<=0||!['PLANNED','COMPLETED'].includes(str(p.status)))return null;
  const dateFrom=planDate(p.date_from),dateTo=planDate(p.date_to),lat=Number(bs.latitude),lng=Number(bs.longitude);
  if(!dateFrom||!dateTo||dateTo<dateFrom||dateTo<cutoff||bs.latitude==null||bs.longitude==null||!str(String(bs.latitude))||!str(String(bs.longitude))||!Number.isFinite(lat)||!Number.isFinite(lng)||lat<49||lat>55.1||lng<14||lng>24.3)return null;
  const operatorName=str(bs.operator);let reportUrl:string|null=null;
  try{const url=new URL(str(p.report),ORIGIN);if(str(p.report)&&url.origin===ORIGIN&&!url.username&&!url.password)reportUrl=url.href;}catch{/* No report URL in this entry. */}
  return {id:String(p.id),stationId:str(bs.identity_name),operator:planOperator(operatorName),operatorName,lab:str(lab.name),accreditation:str(lab.PCA),address:str(bs.address),city:str(bs.city),province:str(bs.voivodeship),lat,lng,dateFrom,dateTo,status:p.status as PemPlan['status'],reportUrl};
}
const meta=(db:DatabaseSync,key:string)=>String(db.prepare('SELECT value FROM metadata WHERE key=?').get(key)?.value||'');
const setMeta=(db:DatabaseSync,key:string,value:string)=>db.prepare('INSERT OR REPLACE INTO metadata(key,value) VALUES(?,?)').run(key,value);
export function prunePlans(db:DatabaseSync,now=new Date()){db.prepare('DELETE FROM pem_plans WHERE dateTo<?').run(retentionCutoff(now));}
export function createPemPlansService(db:DatabaseSync,fetcher:typeof fetch=fetch,clock=()=>new Date()){
  let pending:Promise<void>|null=null;
  async function download(){
    const now=clock(),cutoff=retentionCutoff(now),items=new Map<string,PemPlan>();
    const readPage=async(page:number)=>{
      const url=`${ORIGIN}/api/planned_measurements/?page=${page}&page_size=${PAGE_SIZE}`;
      const response=await fetcher(url,{signal:AbortSignal.timeout(30000),headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error('Serwer SI2PEM nie udostępnił harmonogramu.');
      const text=await response.text();if(text.length>2_000_000)throw new Error('Zbyt duża odpowiedź SI2PEM.');
      const data=JSON.parse(text) as {count:unknown;results:unknown[]};
      if(!Number.isSafeInteger(data.count)||Number(data.count)<0||!Array.isArray(data.results)||data.results.length>PAGE_SIZE)throw new Error('Nieprawidłowy harmonogram SI2PEM.');
      for(const row of data.results){const item=parsePlan(row,cutoff);if(item)items.set(item.id,item);}
      return Number(data.count);
    };
    const count=await readPage(1),pages=Math.ceil(count/PAGE_SIZE);
    if(pages>MAX_PAGES)throw new Error('Harmonogram SI2PEM przekracza limit synchronizacji.');
    let page=2;
    await Promise.all(Array.from({length:Math.min(4,pages-1)},async()=>{while(page<=pages){const current=page++;await readPage(current);}}));
    db.exec('BEGIN');
    try{
      db.exec('DELETE FROM pem_plans');
      const insert=db.prepare('INSERT INTO pem_plans(id,lat,lng,operator,dateTo,data) VALUES(?,?,?,?,?,?)');
      for(const item of items.values())insert.run(item.id,item.lat,item.lng,item.operator,item.dateTo,JSON.stringify(item));
      setMeta(db,'pemPlansCheckedAt',clock().toISOString());setMeta(db,'pemPlansError','');db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    console.log(`SI2PEM: zapisano ${items.size} aktualnych pomiarów z ${count} wpisów.`);
  }
  async function sync(){
    if(pending)return pending;
    setMeta(db,'pemPlansAttemptAt',clock().toISOString());
    pending=download().catch(e=>{setMeta(db,'pemPlansError','Nie udało się odświeżyć harmonogramu SI2PEM.');throw e;}).finally(()=>{pending=null;});
    return pending;
  }
  const due=()=>{const last=Date.parse(meta(db,'pemPlansCheckedAt')),attempt=Date.parse(meta(db,'pemPlansAttemptAt'));return (!Number.isFinite(last)||clock().getTime()-last>=SI2PEM_REFRESH_MS)&&(!Number.isFinite(attempt)||clock().getTime()-attempt>=15*60000);};
  function query(params:Record<string,unknown>):PemPlansResult{
    prunePlans(db,clock());
    const names=['minLat','maxLat','minLng','maxLng'],bounds=names.map(k=>Number(params[k]));
    if(names.some(k=>params[k]===undefined||params[k]==='')||bounds.some(n=>!Number.isFinite(n))||bounds[0]<-90||bounds[1]>90||bounds[2]<-180||bounds[3]>180||bounds[0]>bounds[1]||bounds[2]>bounds[3])throw new Error('Wybierz prawidłowy obszar mapy.');
    const operators=typeof params.operators==='string'?params.operators.split(',').filter(o=>['Orange','T-Mobile','Play','Plus','Inne'].includes(o)):[];
    const where=`lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?${operators.length?` AND operator IN (${operators.map(()=>'?').join(',')})`:''}`,args=[...bounds,...operators];
    const total=Number(db.prepare(`SELECT COUNT(*) AS total FROM pem_plans WHERE ${where}`).get(...args)!.total);
    const checkedAt=meta(db,'pemPlansCheckedAt')||null,nextRefreshAt=checkedAt?new Date(Date.parse(checkedAt)+SI2PEM_REFRESH_MS).toISOString():null;
    return {items:db.prepare(`SELECT data FROM pem_plans WHERE ${where} ORDER BY dateTo DESC,id LIMIT 1000`).all(...args).map(r=>JSON.parse(String(r.data)) as PemPlan),total,limit:1000,hasMore:total>1000,checkedAt,nextRefreshAt,stale:!checkedAt||clock().getTime()-Date.parse(checkedAt)>=SI2PEM_REFRESH_MS,error:meta(db,'pemPlansError')||null};
  }
  return {sync,due,query};
}
