import {useEffect,useState} from 'react';
import {ArrowDownToLine,ArrowLeft,ArrowRight,Check,Database,Info,Radio,Search,ShieldCheck,X} from 'lucide-react';
import type {Submission,Tower,TowerResult,User} from '../types';
import {api,formatDate,formatNumber,post} from '../lib/api';
import {operatorColor,towerTechs} from '../lib/constants';
import {useI18n} from '../lib/i18n';

export function DatabaseView({result,loading,error,query,onQuery,page,onPage,onSelect,onRetry,onOpenCreateStation,source}:{result:TowerResult;loading:boolean;error:string;query:string;onQuery:(q:string)=>void;page:number;onPage:(p:number)=>void;onSelect:(t:Tower)=>void;onRetry:()=>void;onOpenCreateStation?:()=>void;source?:'ALL'|'BTMAP'|'UKE'}){
  const {t} = useI18n();
  const exportCsv=()=>{
    const rows=[['ID','Adres','Województwo','Operatorzy','Technologie','Szerokość','Długość','Źródło'],...result.items.map(tower=>[tower.stationId||tower.id,tower.address,tower.province,tower.operators.map(o=>o.name).join(', '),towerTechs(tower).join(', '),String(tower.lat),String(tower.lng),tower.source])];
    const escape=(v:string)=>'"'+String(v??'').replace(/^[=+@-]/,"'").replaceAll('"','""')+'"';
    const blob=new Blob(['\ufeff'+rows.map(r=>r.map(escape).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;
    a.download=`btmap-stacje-strona-${page+1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const heading = source === 'UKE' ? t.dbHeadingUke : source === 'ALL' ? t.dbHeadingAll : t.dbHeadingBtmap;
  const subtext = source === 'UKE' ? t.dbSubUke : source === 'ALL' ? t.dbSubAll : t.dbSubBtmap;

  return <section className="content-view">
    <div className="page-heading">
      <div>
        <h1>{heading}</h1>
        <p>{subtext}</p>
      </div>
      <div style={{display:'flex',gap:'8px'}}>
        {onOpenCreateStation&&<button className="primary-button" onClick={onOpenCreateStation}><Radio size={16}/>{t.dbAddStation}</button>}
        <button className="secondary-button" onClick={exportCsv} disabled={!result.items.length||loading}><ArrowDownToLine size={16}/>{t.dbExportPage}</button>
      </div>
    </div>
    <div className="database-toolbar">
      <label className="search-box">
        <Search size={18}/>
        <input aria-label={t.dbSearchAria} value={query} onChange={e=>onQuery(e.target.value)} placeholder={t.dbSearchPlaceholder}/>
      </label>
      <span>{loading ? t.filterLoading : source === 'UKE' ? t.dbTotalUke(formatNumber(result.total)) : t.dbTotalBtmap(formatNumber(result.total))}</span>
    </div>
    {error ? (
      <div className="empty-state">
        <strong>{error}</strong>
        <button className="secondary-button" onClick={onRetry}>{t.dbTryAgain}</button>
      </div>
    ) : (
      <>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.dbColStation}</th>
                <th>{t.dbColOperators}</th>
                <th>{t.dbColTechs}</th>
                <th>{t.dbColSource}</th>
                <th><span className="sr-only">{t.dbColDetails}</span></th>
              </tr>
            </thead>
            <tbody>
              {loading ? [1,2,3,4,5].map(i=><tr key={i}><td colSpan={5}><span className="table-skeleton"/></td></tr>) : result.items.map(tower=><tr key={tower.id}>
                <td>
                  <button className="table-station" onClick={()=>onSelect(tower)}>
                    <strong>{tower.address || t.dbNoAddress}</strong>
                    <small>{tower.stationId || tower.id} · {tower.province || 'Polska'}</small>
                  </button>
                </td>
                <td>
                  <div className="table-operators">
                    {tower.operators.map(op=><span key={op.name}><i className="operator-dot" style={{background:operatorColor(op.name)}}/>{op.name}</span>)}
                  </div>
                </td>
                <td>
                  <div className="mini-techs">
                    {towerTechs(tower).slice(0,4).map(tech=><span className={tech==='5G'?'tag-5g':''} key={tech}>{tech}</span>)}
                  </div>
                </td>
                <td><span className="source-tag">{tower.source}</span></td>
                <td>
                  <button className="icon-button" aria-label={`${t.dbColDetails}: ${tower.address}`} onClick={()=>onSelect(tower)}><ArrowRight size={17}/></button>
                </td>
              </tr>)}
            </tbody>
          </table>
          {!loading&&!result.items.length&&(
            <div className="empty-state spacious">
              <Radio size={36}/>
              <h2>{t.dbEmptyTitle}</h2>
              <p>{query ? t.dbEmptyQuery : t.dbEmptyNone}</p>
              {onOpenCreateStation&&<button className="primary-button" style={{marginTop:'12px'}} onClick={onOpenCreateStation}><Radio size={16}/>{t.dbAddNewStation}</button>}
            </div>
          )}
        </div>
        <div className="pagination">
          <span>{t.dbPageOf(page+1, Math.max(1, Math.ceil(result.total/50)))}</span>
          <div>
            <button className="secondary-button" disabled={page===0||loading} onClick={()=>onPage(page-1)}><ArrowLeft size={16}/>{t.dbPrevPage}</button>
            <button className="secondary-button" disabled={!result.hasMore||loading} onClick={()=>onPage(page+1)}>{t.dbNextPage}<ArrowRight size={16}/></button>
          </div>
        </div>
      </>
    )}
  </section>;
}

export { StatsView, type StatsSection } from './StatsView';

export function GuidesView(){
  const {t} = useI18n();
  return <section className="content-view guides-view">
    <div className="page-heading">
      <div>
        <h1>{t.guidesTitle}</h1>
        <p>{t.guidesSubtitle}</p>
      </div>
    </div>
    <article>
      <span className="guide-symbol"><Radio size={27}/></span>
      <h2>{t.guidesQ1}</h2>
      <p>{t.guidesA1}</p>
      <div className="info-note">
        <Info size={18}/>
        <p>{t.guidesNotice}</p>
      </div>
    </article>
    <article>
      <h2>{t.guidesQ2}</h2>
      <p>{t.guidesA2p1}</p>
      <p>{t.guidesA2p2}</p>
    </article>
    <article>
      <h2>{t.guidesQ3}</h2>
      <p>{t.guidesA3}</p>
    </article>
    <article>
      <h2>{t.guidesQ4}</h2>
      <p>{t.guidesA4}</p>
    </article>
  </section>;
}

export function AdminView({user,onUpdate}:{user:User;onUpdate:()=>void}){
  const {t} = useI18n();
  const [items,setItems]=useState<Submission[]>([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState('');
  const [loading,setLoading]=useState(true);

  const load=()=>{
    setLoading(true);
    api<Submission[]>('/admin/queue').then(setItems).catch(e=>setError(e.message)).finally(()=>setLoading(false));
  };

  useEffect(load,[]);

  const decide=async(id:string,action:string)=>{
    setBusy(id);
    setError('');
    try{
      await post('/admin/moderate',{id,action});
      setItems(prev=>prev.filter(i=>i.id!==id));
      onUpdate();
    }catch(e){
      setError((e as Error).message);
    }finally{
      setBusy('');
    }
  };

  return <section className="content-view">
    <div className="page-heading">
      <div>
        <h1>{t.adminTitle}</h1>
        <p>{t.adminSubtitle(user.nick)}</p>
      </div>
      <ShieldCheck size={26}/>
    </div>
    {error&&<p className="form-error">{error}</p>}
    {loading ? (
      <p className="muted">{t.filterLoading}</p>
    ) : items.length ? items.map(item=><article className="moderation-item" key={item.id}>
      <div className="section-label">
        <span>{item.type==='REPORT' ? t.profileReportItem : item.type==='NEW_STATION' ? t.profileNewStationItem : t.profileOlderItem}</span>
        <span>{formatDate(item.createdAt)}</span>
      </div>
      <h2>{item.data?.address || t.dbNoAddress} {item.data?.stationId ? `(${item.data.stationId})` : ''}</h2>
      <p>{item.userNick} · {item.data?.lat}, {item.data?.lng}</p>
      <p>{item.type==='NEW_STATION'?`${item.data?.operator} · Maszt: ${item.data?.mastType || '—'} · Komórki: ${item.data?.cells?.length || 0}`:(item.data?.operators?.map((op:any)=>op.name).join(' · ') || '—')}</p>
      <p>{item.data?.notes}</p>
      {item.type==='NEW_STATION'&&item.data?.cells?.length>0&&(
        <div className="table-scroll">
          <table className="cell-table">
            <thead>
              <tr>
                <th>Tech</th>
                <th>Pasmo</th>
                <th>PCI</th>
                <th>EARFCN</th>
                <th>eNB/gNB</th>
                <th>Sektor</th>
                <th>Azymut</th>
              </tr>
            </thead>
            <tbody>
              {item.data.cells.map((c:any,i:number)=><tr key={i}>
                <td><strong>{c.tech}</strong></td>
                <td>{c.band}</td>
                <td>{c.pci}</td>
                <td>{c.earfcn}</td>
                <td>{c.nodeId || '—'}</td>
                <td>{c.cellId || '—'}</td>
                <td>{c.azimuth != null ? `${c.azimuth}°` : '—'}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
      <details>
        <summary>JSON</summary>
        <pre>{JSON.stringify(item.data,null,2)}</pre>
      </details>
      <div className="moderation-actions">
        <button className="secondary-button" disabled={!!busy} onClick={()=>void decide(item.id,'REJECT')}><X size={16}/>{t.adminReject}</button>
        <button className="primary-button" disabled={!!busy} onClick={()=>void decide(item.id,'APPROVE')}><Check size={16}/>{busy===item.id?t.adminSaving:item.type==='NEW_STATION'?t.adminApprove:t.adminMarkApproved}</button>
      </div>
    </article>) : (
      <div className="empty-state spacious">
        <ShieldCheck size={36}/>
        <h2>{t.adminAllChecked}</h2>
        <p>{t.adminAllCheckedSub}</p>
        <button className="secondary-button" onClick={load}>{t.adminRefresh}</button>
      </div>
    )}
  </section>;
}
