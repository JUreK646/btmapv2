export async function api<T>(path:string,init:RequestInit = {}):Promise<T> {
  const timeout=AbortSignal.timeout(path.includes('/pem-reports') || path.includes('/terrain-profile') || path.includes('/area-evaluation') ? 45000 : 12000);
  const signal=init.signal?AbortSignal.any([init.signal,timeout]):timeout;
  let response:Response;
  try{response=await fetch(`/api${path}`,{credentials:'same-origin',...init,signal,headers:{...(init.body?{'Content-Type':'application/json'}:{}),...init.headers}});}
  catch(e){if((e as Error).name==='TimeoutError')throw new Error('Serwer odpowiada zbyt długo. Spróbuj ponownie.');throw e;}
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.error || 'Nie udało się połączyć z serwerem. Spróbuj ponownie.');
  return data as T;
}
export const post = <T>(path:string,body:unknown) => api<T>(path,{method:'POST',body:JSON.stringify(body)});
export const del = <T>(path:string) => api<T>(path,{method:'DELETE'});
export const formatNumber = (number:number) => new Intl.NumberFormat('pl-PL').format(number);
export const formatDate = (value?:string) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('pl-PL',{day:'numeric',month:'short',year:'numeric'}).format(new Date(value)) : 'Brak daty';
