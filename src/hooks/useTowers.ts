import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import {filterParams} from '../lib/constants';
import {MAP_STATION_LIMIT} from '../../shared/mapLimits';
import type {Bounds,Filters,TowerResult} from '../types';
export function useTowers(filters:Filters,bounds:Bounds|null,search:string,mode:'map'|'database',page:number,refresh=0){
  const [result,setResult]=useState<TowerResult>({items:[],total:0,limit:100,hasMore:false});
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{
    if(mode==='map'&&!bounds)return;
    const abort=new AbortController();setLoading(true);setError('');
    const params=filterParams(filters,mode==='map'?{...bounds!,view:'map',limit:MAP_STATION_LIMIT}:{q:search,limit:50,offset:page*50});
    const timer=setTimeout(()=>api<TowerResult>(`/towers?${params}`,{signal:abort.signal}).then(data=>{setResult(data);setLoading(false);}).catch(e=>{if(e.name!=='AbortError'){setError(e.message);setLoading(false);}}),180);
    return()=>{clearTimeout(timer);abort.abort();};
  },[filters,bounds,search,mode,page,refresh]);
  return {result,loading,error};
}
