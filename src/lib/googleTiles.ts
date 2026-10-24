export interface GoogleSession {session:string;expiry:number;tileWidth:number;tileHeight:number;}
export interface GoogleViewport {north:number;south:number;east:number;west:number;zoom:number;}
let cached:{key:string;value:GoogleSession}|null=null;

export async function googleSession(key:string,signal:AbortSignal):Promise<GoogleSession>{
  if(!key)throw new Error('Google Satellite nie jest jeszcze skonfigurowane.');
  if(cached?.key===key&&cached.value.expiry*1000>Date.now()+60000)return cached.value;
  const response=await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`,{
    method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(10000)]),
    body:JSON.stringify({mapType:'satellite',language:'pl-PL',region:'PL'}),
  });
  if(!response.ok)throw new Error('Google Satellite jest niedostępne. Przywrócono OpenStreetMap.');
  const value=await response.json();
  if(!value.session||!Number.isFinite(Number(value.expiry))||Number(value.expiry)*1000<=Date.now()||value.tileWidth!==256||value.tileHeight!==256)throw new Error('Nie udało się uruchomić Google Satellite. Przywrócono OpenStreetMap.');
  cached={key,value:{...value,expiry:Number(value.expiry)}};
  return cached.value;
}

export async function googleAttribution(key:string,session:string,viewport:GoogleViewport,signal:AbortSignal):Promise<string>{
  const query=new URLSearchParams({key,session,...Object.fromEntries(Object.entries(viewport).map(([k,v])=>[k,String(v)]))});
  const response=await fetch(`https://tile.googleapis.com/tile/v1/viewport?${query}`,{signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
  if(!response.ok)throw new Error('Google Satellite jest niedostępne. Przywrócono OpenStreetMap.');
  const data=await response.json();
  if(typeof data.copyright!=='string'||!data.copyright)throw new Error('Nie udało się odczytać informacji o mapie Google. Przywrócono OpenStreetMap.');
  // Leaflet renders attribution as HTML; provider text must remain plain text.
  const entities:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
  return (data.copyright as string).replace(/[&<>"']/g,char=>entities[char]);
}
