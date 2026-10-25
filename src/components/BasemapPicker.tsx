import {useEffect,useRef,useState} from 'react';
import {Map,Satellite,Mountain,Layers,Check,ChevronUp,X} from 'lucide-react';
import {BASEMAPS,GOOGLE_MAPS_KEY} from '../lib/basemaps';
import type {BasemapId} from '../lib/basemaps';
import {useI18n} from '../lib/i18n';

export default function BasemapPicker({value,onChange}:{value:BasemapId;onChange:(id:BasemapId)=>void}){
  const {t} = useI18n();
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  const current=BASEMAPS.find(item=>item.id===value)!;

  const getMapName = (id: BasemapId) => {
    switch (id) {
      case 'osm': return t.basemapOsmName;
      case 'satellite': return t.basemapSatName;
      case 'terrain': return t.basemapTerrainName;
      case 'google': return t.basemapGoogleName;
    }
  };

  const getMapDesc = (id: BasemapId) => {
    switch (id) {
      case 'osm': return t.basemapOsmDesc;
      case 'satellite': return t.basemapSatDesc;
      case 'terrain': return t.basemapTerrainDesc;
      case 'google': return t.basemapGoogleDesc;
    }
  };

  useEffect(()=>{
    const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};
    document.addEventListener('pointerdown',close);
    document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};
  },[]);

  return <div className="basemap-control" ref={root}>
    {open&&<section className="basemap-popover" aria-label={t.basemapAria}>
      <div className="basemap-heading">
        <h2>{t.basemapTitle}</h2>
        <button className="icon-button" aria-label={t.close} onClick={()=>setOpen(false)}><X size={17}/></button>
      </div>
      <div className="basemap-options">
        {BASEMAPS.map(item=>{
          const Icon=item.kind==='street'?Map:item.kind==='terrain'?Mountain:Satellite;
          const unavailable=item.id==='google'&&!GOOGLE_MAPS_KEY;
          const name = getMapName(item.id);
          const desc = getMapDesc(item.id);
          return <button key={item.id} className={`basemap-option ${value===item.id?'is-active':''}`} aria-pressed={value===item.id} disabled={unavailable} onClick={()=>{onChange(item.id);setOpen(false);}}>
            <Icon size={22}/>
            <span><strong>{name}</strong><small>{desc}</small></span>
            {value===item.id&&<Check size={17}/>}
          </button>;
        })}
      </div>
      <p>{t.basemapDataNotice}</p>
    </section>}
    <button className="basemap-trigger" aria-label={`${t.basemapTitle}: ${getMapName(current.id)}`} aria-expanded={open} onClick={()=>setOpen(!open)}>
      <Layers size={21}/>
      <span><small>{t.basemapTitle}</small><strong>{getMapName(current.id)}</strong></span>
      <ChevronUp size={16} className={open?'rotated':''}/>
    </button>
  </div>;
}
