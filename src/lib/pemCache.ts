import type {Tower} from '../types';
import type {PemReport,PemReportsResult} from '../../shared/pem';
import {SI2PEM_REFRESH_MS} from '../../shared/pemPlans';
import {api} from './api';

type Summary={count:number;partial:boolean;checkedAt:string;key:string};
const results=new Map<string,PemReportsResult>(),pending=new Map<string,Promise<PemReportsResult>>();
const storageKey='btmap.pem.counts.v3';
const identity=(tower:Tower,name:string)=>name||tower.operators[0]?.name||'UKE';
const key=(tower:Tower,name:string)=>{
  const operator=tower.operators.find(op=>op.name===name);
  const ids=operator?(tower.operators.length===1?[tower.stationId,...operator.stationIds||[]].filter(Boolean):operator.stationIds||[]):[tower.stationId,...tower.operators.flatMap(op=>op.stationIds||[])].filter(Boolean);
  return JSON.stringify([tower.id,tower.lat,tower.lng,identity(tower,name),ids]);
};
function summaries():Record<string,Summary>{
  try{const value=JSON.parse(localStorage.getItem(storageKey)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}
}
export function pemSummary(tower:Tower,name=''){
  const operator=identity(tower,name),cacheKey=key(tower,name),summaryId=`${tower.id}::${operator}`,saved=summaries()[summaryId];
  const local=saved?.key===cacheKey&&Number.isSafeInteger(saved.count)&&saved.count>=0&&Number.isFinite(Date.parse(saved.checkedAt))?saved:null;
  const remote=tower.pemReportsByOperator?.[operator],server=remote?{...remote,key:cacheKey}:null;
  return local&&(!server||local.checkedAt>server.checkedAt)?local:server;
}
export const cachedPemReports=(tower:Tower,name='')=>results.get(key(tower,name))||null;
export const freshPemReports=(result:PemReportsResult)=>Date.parse(result.checkedAt)+SI2PEM_REFRESH_MS>Date.now();
export function loadPemReports(tower:Tower,name='',force=false){
  const operator=identity(tower,name),cacheKey=key(tower,name),saved=results.get(cacheKey);
  if(saved&&!force&&freshPemReports(saved))return Promise.resolve(saved);
  if(pending.has(cacheKey))return pending.get(cacheKey)!;
  const query=new URLSearchParams();if(name)query.set('operator',name);if(force)query.set('refresh','1');
  const queryString=query.toString();
  const request=api<PemReportsResult>(`/towers/${encodeURIComponent(tower.id)}/pem-reports${queryString?`?${queryString}`:''}`,{signal:AbortSignal.timeout(40000)}).then(result=>{
    if(results.size>=40)results.delete(results.keys().next().value!);results.set(cacheKey,result);
    try{
      const entries=summaries();entries[`${tower.id}::${operator}`]={key:cacheKey,count:result.reportCount??result.reports.filter(r=>r.kind==='pdf').length,partial:result.partial,checkedAt:result.checkedAt};
      const recent=Object.entries(entries).sort(([,a],[,b])=>String(b.checkedAt).localeCompare(String(a.checkedAt))).slice(0,250);
      localStorage.setItem(storageKey,JSON.stringify(Object.fromEntries(recent)));
    }catch{/* A blocked browser cache does not prevent loading reports. */}
    return result;
  }).finally(()=>pending.delete(cacheKey));
  pending.set(cacheKey,request);return request;
}
const pdfs=new Map<string,{report:PemReport;until:number}>(),pdfPending=new Map<string,Promise<PemReport>>();
export function loadPemPdf(tower:Tower,name:string,report:PemReport){
  const cacheKey=key(tower,name)+report.id,saved=pdfs.get(cacheKey);
  if(saved&&saved.until>Date.now())return Promise.resolve(saved.report);
  if(pdfPending.has(cacheKey))return pdfPending.get(cacheKey)!;
  const request=api<PemReport>(`/towers/${encodeURIComponent(tower.id)}/pem-reports/${report.id}/pdf?operator=${encodeURIComponent(name)}`,{signal:AbortSignal.timeout(100000)}).then(value=>{
    if(pdfs.size>=30)pdfs.delete(pdfs.keys().next().value!);pdfs.set(cacheKey,{report:value,until:Date.now()+SI2PEM_REFRESH_MS});return value;
  }).finally(()=>pdfPending.delete(cacheKey));
  pdfPending.set(cacheKey,request);return request;
}
