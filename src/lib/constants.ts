import type { Filters, Tower } from '../types';
export {OPERATORS,operatorColor} from '../../shared/operators';
export const TECHS=['5G','LTE','UMTS','GSM','CDMA','IOT'];
export const BANDS=['420','450','700','800','900','1800','2100','2600','3500','3600'];
export const PROVINCES=['Dolnośląskie','Kujawsko-pomorskie','Lubelskie','Lubuskie','Łódzkie','Małopolskie','Mazowieckie','Opolskie','Podkarpackie','Podlaskie','Pomorskie','Śląskie','Świętokrzyskie','Warmińsko-mazurskie','Wielkopolskie','Zachodniopomorskie'];
export const DEFAULT_FILTERS:Filters={operators:[],techs:[],bands:[],province:'',source:'ALL',modes5g:[],onlyNew:false};
export const towerTechs=(tower:Tower)=>[...new Set(tower.operators.flatMap(op=>op.bands.map(b=>b.tech==='NR'?'5G':b.tech)))].sort((a,b)=>TECHS.indexOf(a)-TECHS.indexOf(b));
export const filterCount=(f:Filters)=>f.operators.length+f.techs.length+f.bands.length+(f.province?1:0)+(f.source&&f.source!=='ALL'?1:0)+(f.modes5g?f.modes5g.length:0)+(f.onlyNew?1:0);
export function filterParams(filters:Filters,extra:Record<string,string|number>={}) {
  const params = new URLSearchParams({operators:filters.operators.join(','),techs:filters.techs.join(','),bands:filters.bands.join(','),province:filters.province,...Object.fromEntries(Object.entries(extra).map(([k,v])=>[k,String(v)]))});
  if (filters.source && filters.source !== 'ALL' && !params.has('source')) params.set('source', filters.source);
  if (filters.modes5g && filters.modes5g.length > 0) params.set('modes5g', filters.modes5g.join(','));
  if (filters.onlyNew) params.set('onlyNew', '1');
  return params;
}
export function readStored<T>(key:string,fallback:T):T {try{return JSON.parse(localStorage.getItem(key)||'null') ?? fallback;}catch{return fallback;}}
export function saveStored(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value));}catch{/* The app remains usable when storage is blocked. */}}
