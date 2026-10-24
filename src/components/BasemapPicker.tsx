import {useEffect,useRef,useState} from 'react';
import {Map,Satellite,Mountain,Layers,Check,ChevronUp,X} from 'lucide-react';
import {BASEMAPS,GOOGLE_MAPS_KEY} from '../lib/basemaps';
import type {BasemapId} from '../lib/basemaps';

export default function BasemapPicker({value,onChange}:{value:BasemapId;onChange:(id:BasemapId)=>void}){
  const [open,setOpen]=useState(false);const root=useRef<HTMLDivElement>(null);
  const current=BASEMAPS.find(item=>item.id===value)!;
  useEffect(()=>{
    const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};
  },[]);
  return <div className="basemap-control" ref={root}>
    {open&&<section className="basemap-popover" aria-label="Wybór podkładu mapy"><div className="basemap-heading"><h2>Podkład mapy</h2><button className="icon-button" aria-label="Zamknij wybór mapy" onClick={()=>setOpen(false)}><X size={17}/></button></div><div className="basemap-options">{BASEMAPS.map(item=>{
      const Icon=item.kind==='street'?Map:item.kind==='terrain'?Mountain:Satellite;
      const unavailable=item.id==='google'&&!GOOGLE_MAPS_KEY;
      return <button key={item.id} className={`basemap-option ${value===item.id?'is-active':''}`} aria-pressed={value===item.id} disabled={unavailable} onClick={()=>{onChange(item.id);setOpen(false);}}><Icon size={22}/><span><strong>{item.name}</strong><small>{item.description}</small></span>{value===item.id&&<Check size={17}/>}</button>;
    })}</div><p>Dane stacji pozostają z UKE.</p></section>}
    <button className="basemap-trigger" aria-label={`Podkład mapy: ${current.name}`} aria-expanded={open} onClick={()=>setOpen(!open)}><Layers size={21}/><span><small>Podkład mapy</small><strong>{current.name}</strong></span><ChevronUp size={16} className={open?'rotated':''}/></button>
  </div>;
}
