import {useEffect,useRef,useState} from 'react';
import {TileLayer,useMap} from 'react-leaflet';
import type {Theme} from '../types';
import {GOOGLE_MAPS_KEY,TILE_SOURCES} from '../lib/basemaps';
import type {BasemapId} from '../lib/basemaps';
import {googleSession,googleAttribution} from '../lib/googleTiles';
import type {GoogleSession} from '../lib/googleTiles';

function GoogleLayer({onError}:{onError:(message:string)=>void}){
  const map=useMap();const [session,setSession]=useState<GoogleSession|null>(null);
  useEffect(()=>{
    const abort=new AbortController();let viewportAbort:AbortController|undefined;
    let attribution='';let expiryTimer:ReturnType<typeof setTimeout>|undefined;
    let moveHandler:(()=>void)|undefined;
    const start=async()=>{
      try{
        const current=await googleSession(GOOGLE_MAPS_KEY,abort.signal);
        const update=async()=>{
          viewportAbort?.abort();viewportAbort=new AbortController();
          const b=map.getBounds();
          try{
            const next=await googleAttribution(GOOGLE_MAPS_KEY,current.session,{north:Math.min(89.99,b.getNorth()),south:Math.max(-89.99,b.getSouth()),east:Math.min(180,b.getEast()),west:Math.max(-180,b.getWest()),zoom:map.getZoom()},viewportAbort.signal);
            if(abort.signal.aborted)return;
            if(attribution)map.attributionControl.removeAttribution(attribution);
            attribution=`<span class="google-maps-credit">Google Maps</span> ${next}`;
            map.attributionControl.addAttribution(attribution);setSession(current);
          }catch(error){if((error as Error).name!=='AbortError'&&!abort.signal.aborted)onError((error as Error).message);}
        };
        await update();
        if(abort.signal.aborted)return;
        moveHandler=()=>void update();map.on('moveend',moveHandler);
        expiryTimer=setTimeout(()=>onError('Sesja mapy Google wygasła. Wybierz ją ponownie, aby odświeżyć widok.'),Math.min(2147483647,Math.max(1000,current.expiry*1000-Date.now()-30000)));
      }catch(error){if((error as Error).name!=='AbortError'&&!abort.signal.aborted)onError((error as Error).message);}
    };
    void start();return()=>{abort.abort();viewportAbort?.abort();if(moveHandler)map.off('moveend',moveHandler);if(attribution)map.attributionControl.removeAttribution(attribution);clearTimeout(expiryTimer);};
  },[map,onError]);
  return session?<TileLayer url={`https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(session.session)}&key=${encodeURIComponent(GOOGLE_MAPS_KEY)}`} maxZoom={18} keepBuffer={0} eventHandlers={{tileerror:()=>onError('Nie udało się wczytać zdjęć Google. Przywrócono OpenStreetMap.')}}/>:null;
}

export default function BaseLayer({basemap,theme,onError}:{basemap:BasemapId;theme:Theme;onError:(message:string)=>void}){
  const failures=useRef(0),reported=useRef(false);
  useEffect(()=>{failures.current=0;reported.current=false;},[basemap]);
  if(basemap==='google')return <GoogleLayer onError={onError}/>;
  const source=TILE_SOURCES[basemap];
  return <TileLayer key={`${basemap}-${theme}`} url={source.url} attribution={source.attribution} maxZoom={18} className={basemap==='osm'?`map-tiles-${theme}`:''} eventHandlers={{tileerror:()=>{
    if(++failures.current>=4&&!reported.current){reported.current=true;onError(basemap==='osm'?'Nie udało się pobrać mapy. Sprawdź połączenie lub wybierz inny podkład.':'Wybrany podkład jest chwilowo niedostępny. Przywrócono OpenStreetMap.');}
  }}}/>;
}
