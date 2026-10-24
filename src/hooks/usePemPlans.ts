import {useEffect,useState} from 'react';
import type {Bounds} from '../types';
import type {PemPlansResult} from '../../shared/pemPlans';
import {api} from '../lib/api';

export function usePemPlans(enabled:boolean,bounds:Bounds|null,operators:string[],refresh:number){
  const [data,setData]=useState<PemPlansResult|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const operatorKey=operators.join(',');
  useEffect(()=>{
    if(!enabled||!bounds){setData(null);setLoading(false);setError('');return;}
    const abort=new AbortController();let timer:ReturnType<typeof setTimeout>;
    setLoading(true);setError('');
    const load=async()=>{
      try{
        const params=new URLSearchParams({...Object.fromEntries(Object.entries(bounds).map(([k,v])=>[k,String(v)])),operators:operatorKey});
        const result=await api<PemPlansResult>(`/pem-plans?${params}`,{signal:abort.signal});
        if(abort.signal.aborted)return;
        setData(result);setLoading(false);setError('');timer=setTimeout(load,result.checkedAt?60000:10000);
      }catch(e){if(!abort.signal.aborted){setError((e as Error).message);setLoading(false);timer=setTimeout(load,30000);}}
    };
    timer=setTimeout(load,180);
    return()=>{abort.abort();clearTimeout(timer);};
  },[enabled,bounds,operatorKey,refresh]);
  return {data,loading,error};
}
