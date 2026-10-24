import {Marker,Popup,Tooltip,useMap} from 'react-leaflet';
import L from 'leaflet';
import type {PemPlan} from '../../shared/pemPlans';
import {operatorColor} from '../lib/constants';
import {formatDate} from '../lib/api';
import {ExternalLink,X} from 'lucide-react';
import {operatorName} from '../../shared/operators';

export default function PemPlanMarkers({items}:{items:PemPlan[]}){
  const map=useMap();
  return <>{items.map(plan=><Marker key={plan.id} position={[plan.lat,plan.lng]} zIndexOffset={450} keyboard title={`Pomiar PEM · ${plan.operatorName} · ${plan.stationId}`} alt={`Pomiar PEM stacji ${plan.stationId}`} icon={L.divIcon({className:`pem-plan-marker ${operatorName(plan.operator)==='Plus'?'pem-plan-marker-plus':''}`,html:`<span style="background:${operatorColor(plan.operator)}"></span>`,iconSize:[24,24],iconAnchor:[12,12],popupAnchor:[0,-10]})}>
    <Tooltip direction="top" offset={[0,-12]}>Pomiar PEM · {plan.operatorName}<br/>{formatDate(plan.dateFrom)} – {formatDate(plan.dateTo)}</Tooltip>
    <Popup className="pem-plan-popup" minWidth={230} maxWidth={310} closeButton={false} autoPanPaddingTopLeft={[12,110]} autoPanPaddingBottomRight={[36,90]}>
      <article aria-label={`Pomiar PEM stacji ${plan.stationId}`}>
        <button className="pem-plan-close" aria-label="Zamknij pomiar PEM" onClick={()=>map.closePopup()}><X size={16}/></button>
        <div className="pem-plan-heading"><i style={{background:operatorColor(plan.operator)}}/><strong>Pomiar PEM</strong><span>{plan.status==='COMPLETED'?'Zakończony':'Zaplanowany'}</span></div>
        <h2>{plan.operatorName}</h2><p className="pem-plan-address">{plan.city}{plan.address?` · ${plan.address}`:''}</p>
        <dl><div><dt>Stacja</dt><dd>{plan.stationId||'Brak identyfikatora'}</dd></div><div><dt>Wykonawca pomiaru</dt><dd>{plan.lab||'Nie podano'}{plan.accreditation&&<small>Akredytacja {plan.accreditation}</small>}</dd></div><div><dt>Planowany termin</dt><dd><time dateTime={plan.dateFrom}>{formatDate(plan.dateFrom)}</time><span> – </span><time dateTime={plan.dateTo}>{formatDate(plan.dateTo)}</time></dd></div></dl>
        <p className="pem-plan-source">Oficjalny rejestr SI2PEM · Instytut Łączności</p>
        {plan.reportUrl?<a className="pem-plan-source-link" href={plan.reportUrl} target="_blank" rel="noopener noreferrer">Otwórz raport SI2PEM <ExternalLink size={12} aria-hidden="true"/></a>:<a className="pem-plan-source-link" href={`https://si2pem.gov.pl/planned_measurements/?base_station=${encodeURIComponent(plan.stationId)}`} target="_blank" rel="noopener noreferrer">Zobacz wpis w SI2PEM <ExternalLink size={12} aria-hidden="true"/></a>}
      </article>
    </Popup>
  </Marker>)}</>;
}
