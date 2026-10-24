import {Check,ChevronDown,Compass} from 'lucide-react';
import type {Filters as FilterState} from '../types';
import {BANDS,OPERATORS,PROVINCES} from '../lib/constants';

const technologies=[
  {value:'5G',generation:'5G',label:'NR'},
  {value:'LTE',generation:'4G',label:'LTE'},
  {value:'UMTS',generation:'3G',label:'UMTS'},
  {value:'GSM',generation:'2G',label:'GSM'},
  {value:'IOT',generation:'NB',label:'IoT'},
  {value:'CDMA',generation:'',label:'CDMA'},
];

export default function Filters({filters,onChange,pemEnabled,onPemChange,pemStatus,azimuthsEnabled,onAzimuthsChange}:{filters:FilterState;onChange:(f:FilterState)=>void;pemEnabled?:boolean;onPemChange?:(enabled:boolean)=>void;pemStatus?:string;azimuthsEnabled?:boolean;onAzimuthsChange?:(enabled:boolean)=>void}){
  const toggle=(key:'operators'|'techs'|'bands',value:string)=>onChange({
    ...filters,
    [key]:filters[key].includes(value)?filters[key].filter(item=>item!==value):[...filters[key],value],
  });

  return <div className="station-filters">
    {(onPemChange || onAzimuthsChange) && (
      <fieldset className="filter-group pem-layer-group">
        <legend>Warstwy mapy</legend>
        {onPemChange && (
          <>
            <label className="pem-layer-toggle">
              <input type="checkbox" checked={pemEnabled} onChange={e=>onPemChange(e.target.checked)}/>
              <span><strong>Pomiary PEM</strong><small>Planowane i niedawno zakończone · SI2PEM</small></span>
              <i className="pem-layer-key" aria-hidden="true"/>
            </label>
            {pemEnabled && <p className="pem-layer-status" role="status">{pemStatus}</p>}
          </>
        )}
        {onAzimuthsChange && (
          <label className="pem-layer-toggle azimuth-layer-toggle">
            <input type="checkbox" checked={azimuthsEnabled} onChange={e=>onAzimuthsChange(e.target.checked)}/>
            <span><strong>Azymuty</strong><small>Kierunki i sektory anten (widoczne przy zbliżeniu)</small></span>
            <span className="azimuth-layer-key" aria-hidden="true"><Compass size={14}/></span>
          </label>
        )}
      </fieldset>
    )}
    <fieldset className="filter-group">
      <legend>Operatorzy <span>{filters.operators.length?`Wybrano ${filters.operators.length}`:'Wszyscy'}</span></legend>
      <div className="filter-options operator-filters">
        {OPERATORS.map(operator=>{
          const selected=filters.operators.includes(operator.name);
          return <button type="button" key={operator.name} className={`filter-option operator-filter ${selected?'is-selected':''}`} aria-pressed={selected} onClick={()=>toggle('operators',operator.name)}>
            <span className="filter-operator-symbol" aria-hidden="true">{selected?<Check size={12} strokeWidth={3}/>:<i style={{background:operator.color}}/>}</span>
            <span>{operator.name}</span>
          </button>;
        })}
      </div>
    </fieldset>

    <fieldset className="filter-group">
      <legend>Technologie <span>{filters.techs.length?`Wybrano ${filters.techs.length}`:'Wszystkie'}</span></legend>
      <div className="filter-options technology-filters">
        {technologies.map(technology=><button type="button" key={technology.value} className={`filter-option technology-filter ${filters.techs.includes(technology.value)?'is-selected':''}`} aria-label={`Technologia ${technology.generation} ${technology.label}`.trim()} aria-pressed={filters.techs.includes(technology.value)} onClick={()=>toggle('techs',technology.value)}>
          {technology.generation&&<span className="filter-generation" aria-hidden="true">{technology.generation}</span>}
          <span>{technology.label}</span>
        </button>)}
      </div>
    </fieldset>

    <fieldset className="filter-group">
      <legend>Pasma <span>MHz</span></legend>
      <div className="filter-options frequency-filters">
        {BANDS.map(band=><button type="button" key={band} className={`filter-option frequency-filter ${filters.bands.includes(band)?'is-selected':''}`} aria-label={`Pasmo ${band} MHz`} aria-pressed={filters.bands.includes(band)} onClick={()=>toggle('bands',band)}>{band}</button>)}
      </div>
    </fieldset>

    <div className="filter-region">
      <label htmlFor="station-province">Województwo</label>
      <div className="filter-select">
        <select id="station-province" value={filters.province} onChange={event=>onChange({...filters,province:event.target.value})}>
          <option value="">Cała Polska</option>
          {PROVINCES.map(province=><option key={province}>{province}</option>)}
        </select>
        <ChevronDown size={15} aria-hidden="true"/>
      </div>
    </div>
  </div>;
}
