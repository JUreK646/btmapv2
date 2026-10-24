import type {Tower} from '../src/types.ts';
import type {PemMeasurement,PemResult} from '../shared/pem.ts';

const ORIGIN='https://si2pem.gov.pl';
const RADIUS=1000,LIMIT=500;
type Feature={id?:unknown;properties?:Record<string,unknown>};
const numeric=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;
const string=(value:unknown)=>typeof value==='string'?value:'';
const identifier=(value:string)=>value.trim().toLocaleUpperCase('pl-PL');
const tokenMatch=(value:string,id:string)=>new RegExp(`(^|[^\\p{L}\\p{N}_-])${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}($|[^\\p{L}\\p{N}_-])`,'u').test(identifier(value));
function distance(lat:number,lng:number,otherLat:number,otherLng:number){
  const rad=Math.PI/180,a=Math.sin((otherLat-lat)*rad/2)**2+Math.cos(lat*rad)*Math.cos(otherLat*rad)*Math.sin((otherLng-lng)*rad/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function reportLink(value:unknown){
  if(typeof value!=='string'||!value.trim())return null;
  try{const url=new URL(value,ORIGIN);return url.origin===ORIGIN&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
export function stationIdentifiers(tower:Tower){
  return [...new Set([tower.stationId,...tower.operators.flatMap(op=>op.stationIds||[])].filter((id):id is string=>typeof id==='string'&&id.trim().length>0&&id.length<=100).map(identifier))].slice(0,24);
}
const operatorKey=(value:string)=>value.trim().normalize('NFKC').toLocaleLowerCase('pl-PL');
export function towerForPemOperator(tower:Tower,requested?:string):Tower{
  if(!requested){
    if(tower.operators.length>1)throw new Error('Wybierz operatora, aby wyświetlić jego raporty.');
    return tower;
  }
  const operator=tower.operators.find(candidate=>operatorKey(candidate.name)===operatorKey(requested));
  if(!operator)throw new Error('Nie znaleziono operatora dla tej stacji.');
  const sharedIds=new Set(tower.operators.filter(candidate=>candidate!==operator).flatMap(candidate=>candidate.stationIds||[]).map(identifier));
  const exclusiveIds=(operator.stationIds||[]).filter(id=>!sharedIds.has(identifier(id)));
  const ownIds=new Set(exclusiveIds.map(identifier));
  const stationId=tower.operators.length===1?tower.stationId:!tower.stationId||!ownIds.has(identifier(tower.stationId))?undefined:tower.stationId;
  return {...tower,stationId,operators:[{...operator,stationIds:exclusiveIds}]};
}
export function pemRequest(tower:Tower,ids:string[]){
  if(!Number.isFinite(tower.lat)||!Number.isFinite(tower.lng)||tower.lat<49||tower.lat>55||tower.lng<14||tower.lng>25)throw new Error('Nieprawidłowa lokalizacja stacji.');
  const dLat=RADIUS/110574,dLng=RADIUS/(111320*Math.cos(tower.lat*Math.PI/180));
  const box=`BBOX(geom,${tower.lng-dLng},${tower.lat-dLat},${tower.lng+dLng},${tower.lat+dLat},'EPSG:4326')`;
  // Escape CQL literals, including LIKE wildcards. Exact identity matching follows the bounded query.
  const names=ids.map(id=>`identity_names ILIKE '%${id.replace(/'/g,"''").replace(/[%_\\]/g,'\\$&')}%'`).join(' OR ');
  const params=new URLSearchParams({service:'WFS',version:'1.0.0',request:'GetFeature',typeName:'public:measures_all',outputFormat:'application/json',srsName:'EPSG:4326',maxFeatures:String(LIMIT+1),sortBy:'date D',CQL_FILTER:`${box} AND is_old=false AND (${names})`});
  return `${ORIGIN}/geoserver/public/wfs?${params}`;
}
export function parsePem(data:unknown,tower:Tower,ids:string[]):PemResult{
  if(!data||typeof data!=='object'||!Array.isArray((data as {features?:unknown}).features)||(data as {type?:unknown}).type!=='FeatureCollection')throw new Error('Nieprawidłowa odpowiedź SI2PEM.');
  const features=(data as {features:Feature[]}).features,items:PemMeasurement[]=[],matched=new Set<string>(),seen=new Set<string>();
  for(const feature of features){
    const p=feature?.properties;if(!p)continue;
    const lat=numeric(p.latitude),lng=numeric(p.longitude),intensity=numeric(p.intensity);
    const id=string(feature.id),names=string(p.identity_names);
    if(lat===null||lng===null||intensity===null||intensity<0||!id||seen.has(id))continue;
    const meters=distance(tower.lat,tower.lng,lat,lng),matches=ids.filter(key=>tokenMatch(names,key));
    if(meters>RADIUS||!matches.length)continue;
    matches.forEach(key=>matched.add(key));seen.add(id);
    const date=string(p.date);
    items.push({id,point:string(p.number)||id,stationIds:names,date:/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))?date:null,intensity,belowSensitivity:p.below_sensitivity===true,source:string(p.source)||'SI2PEM',distance:Math.round(meters),reportUrl:reportLink(p.url)});
  }
  items.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.distance-b.distance||a.id.localeCompare(b.id));
  return {items:items.slice(0,LIMIT),radiusMeters:RADIUS,limit:LIMIT,hasMore:features.length>LIMIT,matchedIds:[...matched],checkedAt:new Date().toISOString()};
}
export function createPemService(fetcher:typeof fetch=fetch){
  const cache=new Map<string,{until:number;result:PemResult}>(),pending=new Map<string,Promise<PemResult>>();
  return async(tower:Tower):Promise<PemResult>=>{
    const ids=stationIdentifiers(tower);
    if(!ids.length)throw new Error('Brak identyfikatora umożliwiającego powiązanie pomiarów SI2PEM.');
    const key=JSON.stringify([tower.id,tower.lat,tower.lng,ids]);
    const cached=cache.get(key);if(cached&&cached.until>Date.now())return cached.result;
    if(pending.has(key))return pending.get(key)!;
    const request=(async()=>{
      const response=await fetcher(pemRequest(tower,ids),{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error('SI2PEM nie udostępnił wyników.');
      const result=parsePem(await response.json(),tower,ids);
      if(cache.size>=100)cache.delete(cache.keys().next().value!);
      cache.set(key,{until:Date.now()+10*60*1000,result});return result;
    })();
    pending.set(key,request);
    try{return await request;}finally{pending.delete(key);}
  };
}
