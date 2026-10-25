import {ArrowUpRight,Radio,SearchX} from 'lucide-react';
import type {Tower} from '../types';
import {operatorColor,towerTechs} from '../lib/constants';
import {formatNumber} from '../lib/api';
import {useI18n} from '../lib/i18n';

export function TowerRow({tower,selected,onSelect}:{tower:Tower;selected?:boolean;onSelect:()=>void}){
  const {t} = useI18n();
  return <button className={`tower-row ${selected?'selected':''}`} onClick={onSelect}><span className="station-glyph"><Radio size={19}/></span><span className="tower-row-body"><strong>{tower.address || `${t.station} ${tower.stationId || tower.id}`}</strong><span className="tower-row-meta"><span className="operator-dots">{tower.operators.map(op=><i key={op.name} style={{background:operatorColor(op.name)}} title={op.name}/>)}</span>{tower.operators.map(o=>o.name).join(' · ')}</span><span className="tower-row-bottom"><span>{tower.stationId || tower.id.slice(0,14)}</span><span className="mini-techs">{towerTechs(tower).slice(0,3).map(t=><span key={t} className={t==='5G'?'tag-5g':''}>{t}</span>)}</span></span></span><ArrowUpRight size={15} className="row-arrow"/></button>;
}

export default function TowerList({items,total,loading,error,selected,onSelect,onRetry,hasMore}:{items:Tower[];total:number;loading:boolean;error:string;selected:string|undefined;onSelect:(t:Tower)=>void;onRetry:()=>void;hasMore:boolean}){
  const {t} = useI18n();
  return <section className="results-section"><div className="results-heading"><h2>{t.towerListHeading}</h2><span className="count-badge">{loading?'…':formatNumber(total)}</span></div>
    {error?<div className="empty-state"><Radio size={26}/><strong>{t.towerListLoadError}</strong><p>{error}</p><button className="secondary-button" onClick={onRetry}>{t.tryAgain}</button></div>:loading?<div aria-label={t.towerListLoading} className="skeleton-list">{[1,2,3].map(i=><div className="skeleton-row" key={i}><span/><span/><span/></div>)}</div>:items.length?<><div className="tower-list">{items.slice(0,60).map(t=><TowerRow key={t.id} tower={t} selected={t.id===selected} onSelect={()=>onSelect(t)}/>)}</div>{(items.length>60||hasMore)&&<p className="list-hint">{t.towerListHint(Math.min(items.length,60))}</p>}</>:<div className="empty-state"><SearchX size={28}/><strong>{t.towerListEmptyTitle}</strong><p>{t.towerListEmptyDesc}</p></div>}
  </section>;
}
