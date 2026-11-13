import {useEffect,useRef,useState} from 'react';
import {Activity,ArrowUpRight,ChevronDown,Radio,RefreshCw,X} from 'lucide-react';
import type {Tower} from '../types';
import type {PemAntenna,PemReport} from '../../shared/pem';
import {formatDate} from '../lib/api';
import {loadPemPdf} from '../lib/pemCache';

type Props={tower:Tower;operator:string;reports:PemReport[];initialReportId:string;onClose:()=>void};
const num=new Intl.NumberFormat('pl-PL',{maximumFractionDigits:2});
const value=(n:number|null,unit:string)=>n===null?'Brak danych':`${num.format(n)}${unit}`;
const sortBands=(bands:Iterable<string>)=>[...bands].sort((a,b)=>(Number(String(a).match(/\d+/)?.[0])||0)-(Number(String(b).match(/\d+/)?.[0])||0));

function TiltSettings({antenna}:{antenna:PemAntenna}){
  const groups=new Map<string,{tilt:number|null;min:number|null;max:number|null;bands:Set<string>}>();
  antenna.settings?.forEach(s=>{const key=JSON.stringify([s.tilt,s.min,s.max]);if(!groups.has(key))groups.set(key,{...s,bands:new Set()});groups.get(key)!.bands.add(s.band);});
  if(!groups.size)return <>{value(antenna.tilt,'°')}</>;
  return <>{[...groups].map(([key,s])=><span className="pem-tilt-settings" key={key}>{value(s.tilt,'°')}<small>{groups.size>1?`${sortBands(s.bands).join(' / ')} MHz`:''}{s.min!==null&&s.max!==null?`${groups.size>1?' · ':''}${s.min}–${s.max}°`:''}</small></span>)}</>;
}

interface DirectionCluster {
  angles: number[];
  meanAngle: number;
  label: string;
}

function clusterAzimuths(rawAngles: number[], thresholdDeg = 14): DirectionCluster[] {
  if (!rawAngles.length) return [];
  const unique = Array.from(new Set(rawAngles)).sort((a, b) => a - b);
  if (unique.length <= 1) {
    return [
      {
        angles: unique,
        meanAngle: unique[0] ?? 0,
        label: unique.map(a => `${a}°`).join(' · '),
      },
    ];
  }
  const clusters: number[][] = [];
  let curr = [unique[0]];
  for (let i = 1; i < unique.length; i++) {
    const prev = unique[i - 1];
    const a = unique[i];
    if (a - prev <= thresholdDeg) {
      curr.push(a);
    } else {
      clusters.push(curr);
      curr = [a];
    }
  }
  clusters.push(curr);

  // Check circular wrap-around at 360° (e.g. 356° and 4°)
  if (clusters.length > 1) {
    const first = clusters[0];
    const last = clusters[clusters.length - 1];
    const diff = 360 - last[last.length - 1] + first[0];
    if (diff <= thresholdDeg) {
      clusters.pop();
      clusters[0] = [...last, ...first];
    }
  }

  return clusters.map(angles => {
    let sumSin = 0;
    let sumCos = 0;
    for (const a of angles) {
      const rad = (a * Math.PI) / 180;
      sumSin += Math.sin(rad);
      sumCos += Math.cos(rad);
    }
    const meanRad = Math.atan2(sumSin, sumCos);
    const meanAngle = (((meanRad * 180) / Math.PI) % 360 + 360) % 360;
    const label = angles.map(a => `${a}°`).join(' · ');
    return { angles, meanAngle, label };
  });
}

/** Width of a drawn sector. SI2PEM reports give no beam width, so this is only how a direction is drawn. */
const SECTOR_DRAW_DEG = 26;

function DirectionDiagram({antennas}:{antennas:PemAntenna[]}){
  const rawAngles = antennas.flatMap(a => (a.azimuth === null ? [] : [a.azimuth]));
  const uniqueAngles = [...new Set(rawAngles)].sort((a, b) => a - b);
  const countAt = (angle: number) => rawAngles.filter(a => a === angle).length;

  const size = 240;
  const cx = size / 2;
  const cy = size / 2;
  const R = 78;
  const polar = (angleDeg: number, r: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
  };
  const wedge = (angle: number) => {
    const a = polar(angle - SECTOR_DRAW_DEG / 2, R);
    const b = polar(angle + SECTOR_DRAW_DEG / 2, R);
    return `M ${cx} ${cy} L ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y} Z`;
  };

  return (
    <div className="pem-directions">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={
          uniqueAngles.length
            ? `Kierunki anten: ${uniqueAngles.join(', ')} stopni`
            : 'Brak azymutów anten w publicznym zestawieniu'
        }
      >
        <circle cx={cx} cy={cy} r={R} className="pem-dial-disc" />
        <circle cx={cx} cy={cy} r={R * 0.66} className="pem-dial-ring" />
        <circle cx={cx} cy={cy} r={R * 0.33} className="pem-dial-ring" />

        {/* Sectors, one per antenna direction */}
        {uniqueAngles.map(angle => {
          const count = countAt(angle);
          return (
            <path key={angle} d={wedge(angle)} className="pem-dial-sector">
              <title>{`Azymut ${angle}° · ${count} ${count === 1 ? 'antena' : count < 5 ? 'anteny' : 'anten'}`}</title>
            </path>
          );
        })}

        {/* Ticks just outside the dial every 30° */}
        {Array.from({ length: 12 }, (_, i) => {
          const a = polar(i * 30, R + 2);
          const b = polar(i * 30, R + 7);
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="pem-dial-tick" />;
        })}

        {/* Compass labels: N at the top, degrees every 30° */}
        {Array.from({ length: 12 }, (_, i) => {
          const deg = i * 30;
          // Side labels are wider than tall, so they sit a little further out than top and bottom ones.
          const p = polar(deg, R + 18 + Math.abs(Math.sin((deg * Math.PI) / 180)) * 7);
          return (
            <text key={deg} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" className={deg === 0 ? 'pem-dial-label is-north' : 'pem-dial-label'}>
              {deg === 0 ? 'N' : `${deg}°`}
            </text>
          );
        })}

        <circle cx={cx} cy={cy} r={3.5} className="pem-dial-hub" />
      </svg>
      {!uniqueAngles.length && <p>Brak azymutów w zestawieniu</p>}
    </div>
  );
}

/** Antenna heights as dots on a mast, highest first, with how many antennas hang at each. */
function HeightsMast({antennas,heights}:{antennas:PemAntenna[];heights:number[]}){
  const plural = (n: number) => (n === 1 ? 'antena' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'anteny' : 'anten');
  return (
    <div className="pem-heights">
      <h3>Wysokość anten</h3>
      {heights.length ? (
        <ul className="pem-mast">
          {heights.map(h => {
            const n = antennas.filter(a => a.height === h).length;
            return (
              <li key={h}>
                <strong>{num.format(h)} m</strong>
                <span>{n} {plural(n)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>Brak wysokości w zestawieniu</p>
      )}
    </div>
  );
}

function AntennaTable({antennas}:{antennas:PemAntenna[]}){
  const groups=new Map<string,PemAntenna[]>();
  antennas.forEach(a=>{const key=a.azimuth===null?'Brak azymutu':`${a.azimuth}°`;groups.set(key,[...(groups.get(key)||[]),a]);});
  return <div className="pem-antenna-table-wrap"><table className={`pem-antenna-table ${antennas.length?'has-antennas':''}`}><caption className="sr-only">Parametry anten ze wskazanego raportu SI2PEM</caption><thead><tr><th>Wysokość</th><th>Antena</th><th>Pasma MHz</th><th>Pochylenie</th><th>EIRP</th></tr></thead>
    {antennas.length?[...groups].map(([direction,items])=><tbody key={direction}><tr className="pem-direction-row"><th colSpan={5}><Radio size={13}/>{direction}<span>{items.length} {items.length===1?'antena':'anteny'}</span></th></tr>{items.map(a=><tr key={a.id}><td>{value(a.height,' m')}</td><td><strong>{a.model||'Brak modelu'}</strong>{a.manufacturer&&<small>{a.manufacturer}</small>}</td><td>{a.bands.length?sortBands(a.bands).join(' · '):'Brak danych'}</td><td><TiltSettings antenna={a}/></td><td>{value(a.eirp,' W')}{a.eirpCombined?' *':''}{a.sourcePage&&<small>s. {a.sourcePage}</small>}</td></tr>)}</tbody>):<tbody><tr><td colSpan={5}><div className="pem-antennas-empty"><Radio size={25}/><strong>Brak parametrów anten w publicznym zestawieniu</strong><p>SI2PEM udostępnił dane raportu i wyniki pomiarów. Zestawienie nie zawiera modeli anten, kierunków, wysokości, pochylenia ani EIRP.</p></div></td></tr></tbody>}
  </table></div>;
}

export default function PemReportsDialog({tower,operator,reports,initialReportId,onClose}:Props){
  const dialog=useRef<HTMLDialogElement>(null),[selected,setSelected]=useState(initialReportId);
  const [parsed,setParsed]=useState<PemReport|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
  const source=reports.find(r=>r.id===selected)||reports[0];
  useEffect(()=>{
    if(!source)return;let active=true;setParsed(null);setLoading(true);setError('');
    void loadPemPdf(tower,operator,source).then(value=>{if(active)setParsed(value);}).catch(e=>{if(active)setError(e.name==='TimeoutError'?'Odczyt PDF trwa zbyt długo. Otwórz dokument lub spróbuj ponownie.':e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[tower.id,operator,source?.id,retry]);
  const report=parsed||source;
  const antennas=report?.antennas||[],heights=[...new Set(antennas.flatMap(a=>a.height===null?[]:[a.height]))].sort((a,b)=>b-a);
  return <dialog ref={dialog} className="pem-report-dialog" aria-labelledby="pem-dialog-title" onCancel={e=>{e.preventDefault();onClose();}} onKeyDown={e=>{if(e.key==='Escape')e.stopPropagation();}}>
    <header className="pem-report-header"><div><div className="pem-report-title"><span className="pem-wordmark">SI2PEM</span><h2 id="pem-dialog-title">Anteny na stacji</h2></div><p>{operator||tower.operators.map(o=>o.name).join(' · ')}<span>{tower.stationId||tower.id}</span><span>{tower.address}</span></p></div><button className="icon-button" aria-label="Zamknij raporty PEM" onClick={onClose}><X size={19}/></button></header>
    <div className="pem-report-scroll">
      {report?<>
        <div className="pem-report-bar"><div><time dateTime={report.date||undefined}>{formatDate(report.date||undefined)}</time>{source?.id===reports[0]?.id&&<span className="pem-report-latest">Najnowszy</span>}<span>{report.laboratory||'SI2PEM'}</span></div><a href={report.downloadUrl} target="_blank" rel="noopener noreferrer">Otwórz PDF<ArrowUpRight size={14}/></a></div>
        <div className="pem-report-choice"><div><strong>{report.number}</strong><span>{report.stationIds.join(' · ')} · {report.operator}</span></div>{reports.length>1&&<label>Wybierz raport<select value={selected} onChange={e=>setSelected(e.target.value)}>{reports.map(r=><option value={r.id} key={r.id}>{formatDate(r.date||undefined)} · {r.number}</option>)}</select></label>}</div>
        {loading?<div className="pem-report-state" role="status"><RefreshCw size={23}/><strong>Odczytywanie anten z PDF SI2PEM…</strong><p>Pobieranie i analiza parametrów z oficjalnego sprawozdania…</p></div>:error?<div className="pem-report-state"><Activity size={25}/><h3>Nie udało się odczytać PDF</h3><p role="alert">{error}</p><button className="secondary-button" onClick={()=>setRetry(n=>n+1)}><RefreshCw size={14}/>Spróbuj ponownie</button></div>:!antennas.length?<div className="pem-report-state"><Radio size={25}/><h3>Nie udało się rozpoznać tabeli anten</h3><p>Dokument ma inny układ lub jest skanem. Parametry możesz sprawdzić przez „Otwórz PDF”.</p></div>:<>
        <div className="pem-antenna-layout"><aside className="pem-antenna-diagrams" aria-label="Kierunki i wysokości anten"><DirectionDiagram antennas={antennas}/><HeightsMast antennas={antennas} heights={heights}/></aside><section className="pem-antenna-data" aria-label="Parametry anten"><div className="pem-antenna-count">{antennas.length?<><strong>{antennas.length} {antennas.length===1?'antena':'anteny'}</strong><span> · {[...new Set(antennas.map(a=>a.azimuth).filter(a=>a!==null))].length} kierunki</span></>:<strong>Parametry anten</strong>}</div><p className="pem-table-hint">Przesuń tabelę w bok, aby zobaczyć wszystkie parametry.</p><AntennaTable antennas={antennas}/></section></div>
        {antennas.some(a=>a.eirpCombined)&&<p className="pem-partial">* EIRP łączne dla pasm danej anteny, zgodnie z oznaczeniem w PDF.</p>}
        </>}
        {!!report.measurements.length&&<details className="pem-report-readings"><summary><Activity size={15}/>Wyniki pomiarów<span>{report.measurements.length} punktów</span><ChevronDown size={15}/></summary><p>Wartości pola w punktach pomiarowych z wybranego sprawozdania.</p><table><thead><tr><th>Punkt</th><th>Natężenie pola</th></tr></thead><tbody>{report.measurements.slice(0,100).map((m,i)=><tr key={`${m.point}-${i}`}><td>{m.point}</td><td>{m.belowSensitivity?'< ':''}{num.format(m.intensity)} V/m{m.belowSensitivity&&<small>poniżej czułości</small>}</td></tr>)}</tbody></table>{report.measurements.length>100&&<p>Pokazano pierwsze 100 punktów. Pełne dane zawiera PDF.</p>}</details>}
      </>:<div className="pem-report-state"><Activity size={25}/><h3>Brak raportów w publicznym zestawieniu SI2PEM</h3><p>Nie znaleziono sprawozdań powiązanych z identyfikatorami tej stacji.</p><a className="text-button" href="https://si2pem.gov.pl/map/" target="_blank" rel="noopener noreferrer">Sprawdź na mapie SI2PEM<ArrowUpRight size={14}/></a></div>}
    </div>
  </dialog>;
}
