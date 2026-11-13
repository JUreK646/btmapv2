import {Fragment} from 'react';
import {Check,ChevronDown,Compass,Database,FileText,Layers,Radio} from 'lucide-react';
import type {Filters as FilterState} from '../types';
import {BANDS,OPERATORS,PROVINCES} from '../lib/constants';
import {useI18n} from '../lib/i18n';

const technologies=[
  {value:'5G',generation:'5G',label:'NR'},
  {value:'LTE',generation:'4G',label:'LTE'},
  {value:'UMTS',generation:'3G',label:'UMTS'},
  {value:'GSM',generation:'2G',label:'GSM'},
  {value:'IOT',generation:'NB',label:'IoT'},
  {value:'CDMA',generation:'',label:'CDMA'},
];

export default function Filters({
  filters,
  onChange,
  pemEnabled,
  onPemChange,
  pemStatus,
  azimuthsEnabled,
  onAzimuthsChange,
  radiolinesEnabled,
  onRadiolinesChange,
  radiolinesStatus,
  onlyNewRadiolines,
  onOnlyNewRadiolinesChange,
}:{
  filters:FilterState;
  onChange:(f:FilterState)=>void;
  pemEnabled?:boolean;
  onPemChange?:(enabled:boolean)=>void;
  pemStatus?:string;
  azimuthsEnabled?:boolean;
  onAzimuthsChange?:(enabled:boolean)=>void;
  radiolinesEnabled?:boolean;
  onRadiolinesChange?:(enabled:boolean)=>void;
  radiolinesStatus?:string;
  onlyNewRadiolines?:boolean;
  onOnlyNewRadiolinesChange?:(enabled:boolean)=>void;
}){
  const {t} = useI18n();
  // The 5G mode is only recorded for BTMap cells, so the switch exists only for that source with 5G NR selected.
  // Leaving that state clears the mode, so no hidden filter keeps narrowing the results.
  const modeAvailable = (f: FilterState) => f.source === 'BTMAP' && f.techs.includes('5G');
  const emit = (next: FilterState) => onChange(!modeAvailable(next) && next.modes5g?.length ? { ...next, modes5g: [] } : next);
  const toggle=(key:'operators'|'techs'|'bands',value:string)=>emit({
    ...filters,
    [key]:filters[key].includes(value)?filters[key].filter(item=>item!==value):[...filters[key],value],
  });

  const showModes = modeAvailable(filters);
  const toggle5gMode = (mode: 'NSA' | 'SA') => {
    const current = filters.modes5g || [];
    const next = current.includes(mode)
      ? current.filter(m => m !== mode)
      : [...current, mode];
    emit({ ...filters, modes5g: next });
  };
  const modeRow = <div className="mode-5g-row" role="group" aria-label={t.filter5gMode} title={t.filter5gModeDesc}>
    <span className="mode-5g-row-label">{t.filter5gMode}</span>
    <div className="mode-5g-segment">
      {(['NSA', 'SA'] as const).map(mode => {
        const selected = Boolean(filters.modes5g?.includes(mode));
        return <button
          key={mode}
          type="button"
          className={`mode-5g-chip ${selected ? 'is-selected' : ''}`}
          aria-pressed={selected}
          onClick={() => toggle5gMode(mode)}
          title={mode === 'SA' ? t.filter5gModeSaDesc : t.filter5gModeNsaDesc}
        >{mode}</button>;
      })}
    </div>
  </div>;

  return <div className="station-filters">
    {(onPemChange || onAzimuthsChange || onRadiolinesChange) && (
      <fieldset className="filter-group pem-layer-group">
        <legend>{t.filterLayers}</legend>
        {onPemChange && (
          <>
            <label className="pem-layer-toggle">
              <input type="checkbox" checked={pemEnabled} onChange={e=>onPemChange(e.target.checked)}/>
              <span><strong>{t.filterPemTitle}</strong><small>{t.filterPemDesc}</small></span>
              <i className="pem-layer-key" aria-hidden="true"/>
            </label>
            {pemEnabled && <p className="pem-layer-status" role="status">{pemStatus}</p>}
          </>
        )}
        {onAzimuthsChange && (
          <label className="pem-layer-toggle azimuth-layer-toggle">
            <input type="checkbox" checked={azimuthsEnabled} onChange={e=>onAzimuthsChange(e.target.checked)}/>
            <span><strong>{t.filterAzimuthsTitle}</strong><small>{t.filterAzimuthsDesc}</small></span>
            <span className="azimuth-layer-key" aria-hidden="true"><Compass size={14}/></span>
          </label>
        )}
        {onRadiolinesChange && (
          <>
            <label className="pem-layer-toggle radiolines-layer-toggle">
              <input type="checkbox" checked={radiolinesEnabled} onChange={e=>onRadiolinesChange(e.target.checked)}/>
              <span><strong>{t.filterRadiolinesTitle}</strong><small>{t.filterRadiolinesDesc}</small></span>
              <span className="radioline-layer-key" aria-hidden="true"><Radio size={14}/></span>
            </label>
            {radiolinesEnabled && radiolinesStatus && <p className="pem-layer-status" role="status">{radiolinesStatus}</p>}
          </>
        )}
      </fieldset>
    )}
    <fieldset className="filter-group">
      <legend>{t.filterSource} <span>{filters.source === 'BTMAP' ? t.filterSourceDb : filters.source === 'UKE' ? t.filterSourceUke : t.filterSourceAll}</span></legend>
      <div className="filter-options source-filters">
        <button
          type="button"
          className={`filter-option ${(!filters.source || filters.source === 'ALL') ? 'is-selected' : ''}`}
          onClick={() => emit({ ...filters, source: 'ALL' })}
          aria-pressed={!filters.source || filters.source === 'ALL'}
          title={t.filterSourceAllDesc}
        >
          <Layers size={13} />
          <span>{t.filterSourceAll}</span>
        </button>
        <button
          type="button"
          className={`filter-option ${filters.source === 'BTMAP' ? 'is-selected' : ''}`}
          onClick={() => emit({ ...filters, source: 'BTMAP' })}
          aria-pressed={filters.source === 'BTMAP'}
          title={t.filterSourceDbDesc}
        >
          <Database size={13} />
          <span>{t.filterSourceDb}</span>
        </button>
        <button
          type="button"
          className={`filter-option ${filters.source === 'UKE' ? 'is-selected' : ''}`}
          onClick={() => emit({ ...filters, source: 'UKE' })}
          aria-pressed={filters.source === 'UKE'}
          title={t.filterSourceUkeDesc}
        >
          <FileText size={13} />
          <span>{t.filterSourceUke}</span>
        </button>
      </div>
    </fieldset>

    <fieldset className="filter-group">
      <legend>{t.filterOperators} <span>{filters.operators.length ? t.filterSelectedCount(filters.operators.length) : t.filterAll}</span></legend>
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
      <legend>{t.filterTechs} <span>{filters.techs.length ? t.filterSelectedCount(filters.techs.length) : t.filterAllFmt}</span></legend>
      <div className="filter-options technology-filters">
        {technologies.map((technology,index)=><Fragment key={technology.value}>
          <button type="button" className={`filter-option technology-filter ${filters.techs.includes(technology.value)?'is-selected':''}`} aria-label={`Technologia ${technology.generation} ${technology.label}`.trim()} aria-pressed={filters.techs.includes(technology.value)} onClick={()=>toggle('techs',technology.value)}>
            {technology.generation&&<span className="filter-generation" aria-hidden="true">{technology.generation}</span>}
            <span>{technology.label}</span>
          </button>
          {/* Directly under the row that holds 5G NR (the first row of the grid). */}
          {showModes&&index===2&&modeRow}
        </Fragment>)}
      </div>
    </fieldset>

    <fieldset className="filter-group">
      <legend>{t.filterBands} <span>MHz</span></legend>
      <div className="filter-options frequency-filters">
        {BANDS.map(band=><button type="button" key={band} className={`filter-option frequency-filter ${filters.bands.includes(band)?'is-selected':''}`} aria-label={`Pasmo ${band} MHz`} aria-pressed={filters.bands.includes(band)} onClick={()=>toggle('bands',band)}>{band}</button>)}
      </div>
    </fieldset>

    <div className="filter-region">
      <label htmlFor="station-province">{t.filterProvince}</label>
      <div className="filter-select">
        <select id="station-province" value={filters.province} onChange={event=>onChange({...filters,province:event.target.value})}>
          <option value="">{t.filterAllPoland}</option>
          {PROVINCES.map(province=><option key={province}>{province}</option>)}
        </select>
        <ChevronDown size={15} aria-hidden="true"/>
      </div>
    </div>
  </div>;
}
