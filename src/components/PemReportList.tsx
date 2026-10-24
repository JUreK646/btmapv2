import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowUpRight,ChevronDown,RefreshCw} from 'lucide-react';
import type {PemReport,PemReportsResult} from '../../shared/pem';

type Props={result:PemReportsResult|null;count:number|undefined;partial?:boolean;loading:boolean;error:string;onRetry:()=>void;onSelect:(report:PemReport)=>void};
const dateLabel=(date:string|null)=>date?new Intl.DateTimeFormat('pl-PL',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(date)):'Bez daty';
export default function PemReportList({result,count,partial,loading,error,onRetry,onSelect}:Props){
  const [open,setOpen]=useState(false),[position,setPosition]=useState({left:0,top:0,maxHeight:300,width:290});
  const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{
      const rect=trigger.current!.getBoundingClientRect(),width=Math.min(302,window.innerWidth-24),height=Math.min(360,window.innerHeight-24);
      const below=window.innerHeight-rect.bottom-12,above=rect.top-12,useAbove=below<180&&above>below;
      const maxHeight=Math.min(height,useAbove?above:below);
      setPosition({left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),top:useAbove?Math.max(12,rect.top-Math.min(panel.current?.scrollHeight||height,maxHeight)-6):rect.bottom+6,width,maxHeight});
    };
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[open,result,error,loading]);
  useEffect(()=>{
    if(!open)return;
    panel.current?.focus();
    const outside=(e:PointerEvent)=>{if(!panel.current?.contains(e.target as Node)&&!trigger.current?.contains(e.target as Node))setOpen(false);};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);trigger.current?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true);};
  },[open]);
  const groups=new Map<string,PemReport[]>();
  result?.reports.forEach(report=>{const year=report.date?.slice(0,4)||'Bez daty';groups.set(year,[...(groups.get(year)||[]),report]);});
  const newest=result?.reports.find(r=>r.kind==='pdf')?.id;
  return <><button ref={trigger} className="station-reports-trigger" onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-controls={open?'pem-report-list':undefined} aria-label={`Raporty PEM SI2PEM${count!==undefined?`: ${count}`:''}`}><strong>SI2PEM</strong><span>{count??(loading?'…':error?'Sprawdź':'…')}{partial?' +':''}</span><ChevronDown size={13}/></button>
    {open&&createPortal(<div ref={panel} id="pem-report-list" tabIndex={-1} className="pem-report-list" style={{position:'fixed',width:position.width,maxWidth:'calc(100vw - 24px)',maxHeight:`min(${position.maxHeight}px, calc(100dvh - 24px))`,left:`clamp(12px, ${position.left}px, calc(100vw - ${position.width}px - 12px))`,top:`clamp(12px, ${position.top}px, calc(100dvh - ${Math.min(panel.current?.scrollHeight||position.maxHeight,position.maxHeight)}px - 12px))`}} aria-label="Dokumenty SI2PEM">
      {loading&&!result?<p className="pem-list-message" role="status">Wczytywanie dokumentów…</p>:error&&!result?<div className="pem-list-message"><p role="alert">{error}</p><button onClick={onRetry}><RefreshCw size={13}/>Spróbuj ponownie</button></div>:<>
        {partial&&<div className="pem-list-message"><p>Lista może być niepełna.{error&&' Nie udało się jej odświeżyć.'}</p><button onClick={onRetry}><RefreshCw size={13}/>Odśwież listę</button></div>}
        {groups.size?[...groups].map(([year,reports])=><section key={year}><h3>{year}</h3>{reports.map(report=>{
          const content=<><span className="pem-list-row-title"><time dateTime={report.date||undefined}>{dateLabel(report.date)}</time><span className="pem-list-source">{report.sourceLabel}</span>{report.id===newest&&<span className="pem-list-newest">Najnowszy</span>}</span><span className="pem-list-publisher">{report.laboratory||report.operator||'SI2PEM'}</span><ArrowUpRight size={13} aria-hidden="true"/></>;
          return report.kind==='pdf'?<button key={report.id} className="pem-list-row" onClick={()=>{setOpen(false);onSelect(report);}}>{content}</button>:<a key={report.id} className="pem-list-row" href={report.downloadUrl} target="_blank" rel="noopener noreferrer">{content}</a>;
        })}</section>):<p className="pem-list-message">{partial?'Nie udało się potwierdzić dostępnych raportów.':'Brak raportów PDF SI2PEM dla tej stacji.'}</p>}
      </>}
    </div>,document.body)}
  </>;
}
