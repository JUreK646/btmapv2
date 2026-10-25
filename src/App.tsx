import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Map as MapIcon,Database,ChartNoAxesCombined,Sun,Moon,Plus,Minus,LocateFixed,Maximize,Radio,RadioTower,ArrowUpRight,SlidersHorizontal,PanelLeftClose,PanelLeftOpen,X,Info,ChevronRight,UserRound,List,Menu,RotateCcw,DatabaseZap,History,Crosshair,Radar,Compass} from 'lucide-react';
import type L from 'leaflet';
import MapView from './components/MapView';
import BasemapPicker from './components/BasemapPicker';
import FiltersPanel from './components/Filters';
import Search from './components/Search';
import TowerList from './components/TowerList';
import DetailsPanel from './components/DetailsPanel';
import ChangelogView from './components/ChangelogView';
import {AuthDialog,ProfileDialog,SubmitDialog} from './components/Forms';
import {AdminView,DatabaseView,GuidesView,StatsView} from './components/Views';
import StationSubmissionDialog from './components/StationSubmissionDialog';
import TerrainProfileDialog from './components/TerrainProfileDialog';
import AreaEvaluationDialog from './components/AreaEvaluationDialog';
import {useAuth} from './hooks/useAuth';
import {useTowers} from './hooks/useTowers';
import {usePemPlans} from './hooks/usePemPlans';
import {api,formatNumber} from './lib/api';
import {DEFAULT_FILTERS,OPERATORS,filterCount,readStored,saveStored} from './lib/constants';
import {getStoredBasemap} from './lib/basemaps';
import type {BasemapId} from './lib/basemaps';
import type {Bounds,Filters,Health,Theme,Tower,View} from './types';

const navItems=[{id:'map',label:'Mapa',icon:MapIcon},{id:'database',label:'Baza stacji',icon:Database},{id:'stats',label:'Statystyki',icon:ChartNoAxesCombined}] as const;
const viewNames:Record<View,string>={map:'Mapa stacji',database:'Baza stacji',stats:'Statystyki',guides:'O danych',admin:'Moderacja',changelog:'Changelog'};
const readView=():View=>{
  if(window.location.pathname.replace(/\/+$/,'')==='/btmap/changelog')return 'changelog';
  const saved=window.history.state?.btmapView;
  return ['map','database','stats','guides','admin'].includes(saved)?saved:'map';
};

export default function App(){
  const [theme,setTheme]=useState<Theme>(()=>{const stored=readStored<unknown>('btmap.theme',null);return stored==='light'?'light':'dark';});
  const [view,setView]=useState<View>(readView);
  const [filters,setFilters]=useState<Filters>(DEFAULT_FILTERS);
  const [showPem,setShowPem]=useState(false);
  const [showAzimuths,setShowAzimuths]=useState(false);
  const [panel,setPanel]=useState<'filters'|'stations'|null>(null),[navCollapsed,setNavCollapsed]=useState(false),[mobileNav,setMobileNav]=useState(false);
  const [basemap,setBasemap]=useState<BasemapId>(getStoredBasemap);
  const [map,setMap]=useState<L.Map|null>(null),[bounds,setBounds]=useState<Bounds|null>(null),[selected,setSelected]=useState<Tower|null>(null);
  const [health,setHealth]=useState<Health|null>(null),[healthError,setHealthError]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(0),[refresh,setRefresh]=useState(0),[notice,setNotice]=useState('');
  const [dialog,setDialog]=useState<'auth'|'profile'|'submit'|null>(null),[editTower,setEditTower]=useState<Tower|null>(null),[position,setPosition]=useState<[number,number]|null>(null),[locating,setLocating]=useState(false);
  const [createStationTower,setCreateStationTower]=useState<Tower|null|'blank'>(null);
  const [terrainTower, setTerrainTower] = useState<Tower | null>(null);
  const [terrainTarget, setTerrainTarget] = useState<[number, number] | null>(null);
  const [isPickingTerrainTarget, setIsPickingTerrainTarget] = useState(false);
  const [terrainSectorAzimuth, setTerrainSectorAzimuth] = useState<number | null>(null);

  const [evalTarget, setEvalTarget] = useState<[number, number] | null>(null);
  const [evalRadiusM, setEvalRadiusM] = useState<number>(500);
  const [isPickingEvalTarget, setIsPickingEvalTarget] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);

  const openAreaEvaluation = (coords?: [number, number]) => {
    if (coords) {
      setEvalTarget(coords);
      setIsPickingEvalTarget(false);
    } else {
      setIsPickingEvalTarget(true);
      setPanel(null);
    }
  };
  const handleEvalTargetChange = (coords: [number, number]) => {
    setEvalTarget(coords);
    setIsPickingEvalTarget(false);
  };
  const handleCancelEvalPick = () => {
    setIsPickingEvalTarget(false);
  };
  const closeAreaEvaluation = () => {
    setEvalTarget(null);
    setIsPickingEvalTarget(false);
  };

  const openTerrainProfile = (tower: Tower) => {
    setTerrainTower(tower);
    setTerrainTarget(null);
    setTerrainSectorAzimuth(null);
    setIsPickingTerrainTarget(true);
  };
  const handleTerrainTargetChange = (coords: [number, number]) => {
    setTerrainTarget(coords);
    setIsPickingTerrainTarget(false);
  };
  const handleCancelPick = () => {
    setIsPickingTerrainTarget(false);
    if (!terrainTarget) {
      setTerrainTower(null);
    }
  };
  const closeTerrainProfile = () => {
    setTerrainTower(null);
    setTerrainTarget(null);
    setTerrainSectorAzimuth(null);
    setIsPickingTerrainTarget(false);
  };

  const terrainAzimuth = useMemo(() => {
    if (!terrainTower || !terrainTarget) return null;
    const dLat = (terrainTarget[0] - terrainTower.lat) * (Math.PI / 180);
    const dLng = (terrainTarget[1] - terrainTower.lng) * (Math.PI / 180);
    const y = Math.sin(dLng) * Math.cos(terrainTarget[0] * (Math.PI / 180));
    const x =
      Math.cos(terrainTower.lat * (Math.PI / 180)) * Math.sin(terrainTarget[0] * (Math.PI / 180)) -
      Math.sin(terrainTower.lat * (Math.PI / 180)) * Math.cos(terrainTarget[0] * (Math.PI / 180)) * Math.cos(dLng);
    return Math.round((Math.atan2(y, x) * (180 / Math.PI) + 360) % 360);
  }, [terrainTower, terrainTarget]);
  const {user,authenticate,logout}=useAuth();
  const {result,loading,error}=useTowers(filters,bounds,query,view==='database'?'database':'map',page,refresh);
  const pem=usePemPlans(showPem&&view==='map',bounds,filters.operators,refresh);
  const pemCount=pem.data?.items.length??0;
  const pemUnit=pemCount===1?'pomiar':pemCount%10>=2&&pemCount%10<=4&&(pemCount%100<12||pemCount%100>14)?'pomiary':'pomiarów';
  const pemStatus=pem.loading?'Wczytywanie pomiarów SI2PEM…':pem.error?'Nie udało się wczytać pomiarów SI2PEM':!pem.data?.checkedAt?(pem.data?.error||'Wczytywanie z SI2PEM…'):pemCount===0?'Brak pomiarów SI2PEM w tym obszarze':`${pemCount} ${pemUnit} w obszarze${pem.data.hasMore?' · przybliż mapę, aby zobaczyć pozostałe':''}`;
  const mapFrame=useRef<HTMLDivElement>(null);
  const pendingPlace=useRef<[number,number]|null>(null);
  const lastView=useRef<{center:[number,number];zoom:number}>({center:[52.2305,21.0084],zoom:12});
  const mapReady=useCallback((instance:L.Map)=>{
    instance.setView(pendingPlace.current||lastView.current.center,pendingPlace.current?14:lastView.current.zoom);
    pendingPlace.current=null;setMap(instance);
  },[]);
  const boundsChanged=useCallback((value:Bounds)=>{
    lastView.current={center:[(value.minLat+value.maxLat)/2,(value.minLng+value.maxLng)/2],zoom:value.zoom};setBounds(value);
  },[]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;saveStored('btmap.theme',theme);document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#08090b':'#f5f6f3');},[theme]);
  useEffect(()=>{saveStored('btmap.basemap',basemap);},[basemap]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),7000);return()=>clearTimeout(timer);},[notice]);
  const loadHealth=useCallback(()=>{setHealthError('');api<Health>('/health').then(setHealth).catch(e=>setHealthError(e.message));},[]);
  useEffect(loadHealth,[loadHealth,refresh]);
  const selectTower = useCallback((tower: Tower) => {
    if (isPickingEvalTarget) {
      handleEvalTargetChange([tower.lat, tower.lng]);
      return;
    }
    setSelected(tower);
    setPanel(null);
    if (terrainTower && terrainTower.id !== tower.id && !isPickingTerrainTarget) {
      closeTerrainProfile();
    }
    const url = new URL(window.location.href);
    url.searchParams.set('station', tower.id);
    window.history.replaceState({}, '', url);
  }, [terrainTower, isPickingTerrainTarget, isPickingEvalTarget]);
  const closeTower = () => {
    setSelected(null);
    if (isPickingTerrainTarget) {
      handleCancelPick();
    }
    if (isPickingEvalTarget) {
      handleCancelEvalPick();
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('station');
    window.history.replaceState({}, '', url);
  };
  useEffect(()=>{if(view!=='map')return;const abort=new AbortController(),id=new URLSearchParams(window.location.search).get('station');if(id)api<Tower>(`/towers/${encodeURIComponent(id)}`,{signal:abort.signal}).then(selectTower).catch(e=>{if(e.name!=='AbortError')setNotice(e.message);});return()=>abort.abort();},[selectTower,view]);
  useEffect(()=>{
    const restore=()=>{const next=readView();setView(next);setPanel(null);setMobileNav(false);setSelected(null);if(next!=='map')setMap(null);};
    window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);
  },[]);
  useEffect(()=>{document.title=view==='changelog'?'Changelog — BTMap v2':'BTMap v2 — Odkrywaj sieć';if(view==='changelog')document.getElementById('main-content')?.focus();},[view]);
  useEffect(()=>{if(map&&selected&&view==='map')map.flyTo([selected.lat,selected.lng],Math.max(map.getZoom(),14),{duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:0.65});},[selected?.id,map,view]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !dialog) {
        if (isPickingEvalTarget) {
          handleCancelEvalPick();
        } else if (evalTarget) {
          closeAreaEvaluation();
        } else if (isPickingTerrainTarget) {
          handleCancelPick();
        } else if (terrainTower || terrainTarget) {
          closeTerrainProfile();
        } else {
          closeTower();
          setPanel(null);
          setMobileNav(false);
        }
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [dialog, isPickingTerrainTarget, terrainTower, terrainTarget, isPickingEvalTarget, evalTarget]);
  const changeFilters=(value:Filters)=>{setFilters(value);setPage(0);};
  const changeView=(next:View)=>{
    if(next!=='map'){setSelected(null);setMap(null);}
    if(next!==view){const url=new URL(window.location.href);url.pathname=next==='changelog'?'/btmap/changelog':'/btmap';url.hash='';if(next!=='map')url.searchParams.delete('station');window.history.pushState({...window.history.state,btmapView:next},'',url);}
    setView(next);setPanel(null);setMobileNav(false);
  };
  const openOnMap=(tower:Tower)=>{pendingPlace.current=[tower.lat,tower.lng];changeView('map');selectTower(tower);};
  const togglePanel=(next:'filters'|'stations')=>{closeTower();setPanel(panel===next?null:next);};
  const locate=()=>{
    if(!navigator.geolocation){setNotice('Wpisz miejscowość w wyszukiwarce — ta przeglądarka nie udostępnia lokalizacji.');return;}
    setLocating(true);navigator.geolocation.getCurrentPosition(p=>{setPosition([p.coords.latitude,p.coords.longitude]);map?.flyTo([p.coords.latitude,p.coords.longitude],14);setLocating(false);},()=>{setLocating(false);setNotice('Nie udało się pobrać lokalizacji. Sprawdź zgodę przeglądarki lub wyszukaj miejscowość.');},{enableHighAccuracy:true,timeout:12000});
  };
  const openSubmit=(tower:Tower)=>{setEditTower(tower);setDialog(user?'submit':'auth');};
  const openCreateStation=(tower:Tower|null)=>{
    setCreateStationTower(tower||'blank');
  };
  const handleAuth=async(mode:'login'|'register',data:unknown)=>{
    const u=await authenticate(mode,data);
    if(editTower){
      setCreateStationTower(editTower);
      setEditTower(null);
    }
    return u;
  };
  const fullscreen=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await mapFrame.current?.requestFullscreen();}catch{setNotice('Pełny ekran nie jest dostępny w tej przeglądarce.');}};
  const basemapError=useCallback((message:string)=>{setBasemap('osm');setNotice(message);},[]);
  const filterTotal=filterCount(filters)+(showPem&&view==='map'?1:0)+(showAzimuths&&view==='map'?1:0);
  const filterPanel=<aside className="floating-panel filter-drawer" aria-labelledby="station-filters-title">
    <div className="filter-drawer-heading"><h2 id="station-filters-title">{view==='map'?'Filtry mapy':'Filtry stacji'}</h2><span className="filter-data-source"><DatabaseZap size={13} aria-hidden="true"/>UKE{showPem&&view==='map'?' · SI2PEM':''}</span><button className="icon-button" aria-label="Zamknij filtry" onClick={()=>setPanel(null)}><X size={18}/></button></div>
    <div className="panel-scroll"><FiltersPanel filters={filters} onChange={changeFilters} pemEnabled={showPem} onPemChange={view==='map'?setShowPem:undefined} pemStatus={pemStatus} azimuthsEnabled={showAzimuths} onAzimuthsChange={view==='map'?setShowAzimuths:undefined}/></div>
    <div className="filter-drawer-footer"><p className="filter-results" role="status">{loading?'Wczytywanie stacji…':error?'Nie udało się wczytać wyników':<><strong>{formatNumber(result.total)}</strong> {view==='database'?'lokalizacji w bazie':'lokalizacji w tym obszarze'}</>}</p><div className="filter-drawer-actions"><button className="filter-reset" disabled={!filterTotal} onClick={()=>{changeFilters(DEFAULT_FILTERS);if(view==='map'){setShowPem(false);setShowAzimuths(false);}}}><RotateCcw size={14}/>Wyczyść{filterTotal>0&&<span>{filterTotal}</span>}</button><button className="primary-button" onClick={()=>setPanel(null)}>Gotowe</button></div></div>
  </aside>;

  return <div className={`app-layout ${navCollapsed?'nav-compact':''} ${mobileNav?'nav-open':''}`}>
    <a className="skip-link" href="#main-content">Przejdź do treści</a>
    {mobileNav&&<button className="nav-scrim" aria-label="Zamknij nawigację" onClick={()=>setMobileNav(false)}/>}
    <aside className="app-sidebar" aria-label="Menu aplikacji">
      <button className="sidebar-brand" onClick={()=>changeView('map')} aria-label="BTMap — przejdź do mapy"><span className="sidebar-brand-symbol"><Radio size={25}/></span><span className="sidebar-wordmark">btmap<span>.</span></span><span className="sidebar-version">v2</span></button>
      <nav className="side-nav" aria-label="Nawigacja główna">{navItems.map(item=><button key={item.id} className={view===item.id?'active':''} aria-current={view===item.id?'page':undefined} title={item.label} onClick={()=>changeView(item.id)}><item.icon size={19}/><span>{item.label}</span>{view===item.id&&<span className="nav-active-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><a className="sidebar-about" href="/btmap/changelog" title="Changelog" aria-current={view==='changelog'?'page':undefined} onClick={e=>{if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();changeView('changelog');}}}><History size={18}/><span>Changelog</span></a><button className="sidebar-about" title="O danych UKE" onClick={()=>changeView('guides')}><Info size={18}/><span>O danych UKE</span></button><div className="sidebar-account"><button onClick={()=>setDialog(user?'profile':'auth')} title={user?'Twoje konto':'Zaloguj się'}><span className="sidebar-avatar">{user?user.nick.slice(0,1).toUpperCase():<UserRound size={19}/>}</span><span><strong>{user?user.nick:'Zaloguj się'}</strong><small>{user?'Twoje konto':'Konto i zgłoszenia'}</small></span><ArrowUpRight size={16}/></button></div></div>
    </aside>
    <section className="app-main">
      <header className="workspace-header"><div className="workspace-heading"><button className="icon-button desktop-nav-toggle" aria-label={navCollapsed?'Rozwiń nawigację':'Zwiń nawigację'} onClick={()=>setNavCollapsed(!navCollapsed)}>{navCollapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}</button><button className="icon-button mobile-nav-toggle" aria-label="Otwórz nawigację" onClick={()=>setMobileNav(!mobileNav)}><Menu size={21}/></button><span className="breadcrumb-parent">{view==='changelog'?'BTMap':'Stacje bazowe'}</span><ChevronRight className="breadcrumb-chevron" size={14}/><h1>{viewNames[view]}</h1></div><div className="workspace-actions"><span className="connection-status"><span className={`connection-dot ${healthError?'offline':''}`}/>{healthError?'Brak połączenia':health?`${formatNumber(health.stats.towers)} lokalizacji UKE`:'Łączenie…'}</span><button className="icon-button theme-toggle" onClick={()=>setTheme(theme==='dark'?'light':'dark')} aria-label={theme==='dark'?'Włącz jasny motyw':'Włącz ciemny motyw'}>{theme==='dark'?<Sun size={19}/>:<Moon size={19}/>}</button></div></header>
      <main id="main-content" className="workspace-body" tabIndex={-1}>
        {view==='map'?<div className={`map-workspace ${selected?'has-details':''} ${panel?'has-drawer':''}`} ref={mapFrame}>
          <MapView
            theme={theme}
            basemap={basemap}
            onBasemapError={basemapError}
            items={result.items}
            selected={selected}
            onSelect={selectTower}
            onBounds={boundsChanged}
            onReady={mapReady}
            radiolines={[]}
            position={position}
            pemPlans={showPem?pem.data?.items:[]}
            terrainTower={terrainTower}
            terrainTarget={terrainTarget}
            terrainAzimuth={terrainSectorAzimuth ?? terrainAzimuth}
            onTerrainTargetChange={handleTerrainTargetChange}
            isPickingTerrainTarget={isPickingTerrainTarget}
            evalTarget={evalTarget}
            evalRadiusM={evalRadiusM}
            onEvalTargetChange={handleEvalTargetChange}
            isPickingEvalTarget={isPickingEvalTarget}
            showAzimuths={showAzimuths}
          />
          {isPickingTerrainTarget && (
            <div className="tp-pick-banner" role="status">
              <Crosshair size={18} className="tp-pulse-icon" />
              <span>Kliknij w wybranym miejscu na mapie, aby wyznaczyć profil terenu od stacji <strong>{terrainTower?.stationId || terrainTower?.id}</strong></span>
              <button type="button" className="tp-pick-cancel" onClick={handleCancelPick}>Anuluj</button>
            </div>
          )}
          {isPickingEvalTarget && (
            <div className="ae-pick-banner" role="status">
              <Radar size={18} className="ae-pulse-radar" />
              <span>Kliknij budynek, działkę lub obszar na mapie, aby ocenić 4 operatorów (maks. 3 km²)</span>
              <button type="button" className="ae-pick-cancel" onClick={handleCancelEvalPick}>Anuluj</button>
            </div>
          )}
          <div className="map-hud"><button className="map-summary" aria-label="Pokaż stacje w obszarze" aria-expanded={panel==='stations'} onClick={()=>togglePanel('stations')}><Radio size={17}/><strong>{loading?'…':formatNumber(result.total)}</strong><span>lokalizacji</span><span className="hud-divider"/><span className="hud-source">UKE</span><List size={16}/></button><div className="map-coordinates">{bounds?<><span>Środek mapy</span>{((bounds.minLat+bounds.maxLat)/2).toFixed(4)}, {((bounds.minLng+bounds.maxLng)/2).toFixed(4)}<span className="coordinate-zoom">Z{bounds.zoom}</span></>:'Wczytywanie mapy…'}</div></div>
          <div className={`map-searchbar ${isSearchActive ? 'search-active' : ''}`}>
            <Search
              onSelect={selectTower}
              onPlace={(lat,lng)=>{closeTower();setPanel(null);map?.flyTo([lat,lng],14);}}
              onError={setNotice}
              onActiveChange={setIsSearchActive}
            />
            <div className="map-searchbar-actions">
              <button
                type="button"
                className={`filter-trigger ${evalTarget || isPickingEvalTarget ? 'selected' : ''}`}
                onClick={() => {
                  if (evalTarget || isPickingEvalTarget) {
                    closeAreaEvaluation();
                  } else if (selected) {
                    openAreaEvaluation([selected.lat, selected.lng]);
                  } else {
                    setIsPickingEvalTarget(true);
                    setPanel(null);
                    setSelected(null);
                    setNotice('Kliknij punkt lub stację na mapie, aby wykonać audyt 4 operatorów.');
                  }
                }}
                aria-label="Audyt operatorów"
                title="Audyt i ocena operatorów w wybranej lokalizacji (maks. 3.0 km²)"
              >
                <Radar size={17} />
                <span>Audyt</span>
              </button>
              <button
                type="button"
                className={`filter-trigger ${panel==='filters'||filterTotal?'selected':''}`}
                onClick={()=>togglePanel('filters')}
                aria-expanded={panel==='filters'}
                aria-label="Filtry"
              >
                <SlidersHorizontal size={17}/>
                <span>Filtry</span>
                {filterTotal>0&&<b>{filterTotal}</b>}
              </button>
              <button
                type="button"
                className="filter-trigger"
                onClick={() => openCreateStation(null)}
                aria-label="Dodaj nową stację"
                title="Dodaj nową stację bazową dla wybranego operatora"
              >
                <RadioTower size={17} />
                <span>Dodaj stację</span>
              </button>
            </div>
          </div>
          {error&&<div className="map-error" role="alert">{error}<button onClick={()=>setRefresh(r=>r+1)}>Ponów</button></div>}
          {((showPem || showAzimuths) && !panel && !selected) && (
            <div className="map-status-stack">
              {showAzimuths && <div className="azimuth-map-status" role="status"><Compass size={13} aria-hidden="true"/><span>{bounds&&bounds.zoom<14?'Azymuty: przybliż mapę (zoom 14+), aby zobaczyć sektory':'Azymuty anten włączone'}</span></div>}
              {showPem && <div className="pem-map-status" role="status"><i aria-hidden="true"/>{pemStatus}{(pem.error||pem.data?.error)&&<button onClick={()=>setRefresh(r=>r+1)}>Ponów</button>}</div>}
            </div>
          )}
          <div className="map-tools">
            <div className="map-control-group"><button aria-label="Przybliż mapę" onClick={()=>map?.zoomIn()}><Plus size={20}/></button><button aria-label="Oddal mapę" onClick={()=>map?.zoomOut()}><Minus size={20}/></button></div>
            <button
              type="button"
              className={`map-tool ${evalTarget || isPickingEvalTarget ? 'active' : ''}`}
              aria-label="Audyt operatorów"
              title="Audyt i ocena 4 operatorów na wybranym terenie (maks. 3 km²)"
              onClick={() => {
                if (evalTarget || isPickingEvalTarget) {
                  closeAreaEvaluation();
                } else if (selected) {
                  openAreaEvaluation([selected.lat, selected.lng]);
                } else {
                  setIsPickingEvalTarget(true);
                  setPanel(null);
                  setSelected(null);
                  setNotice('Kliknij punkt lub stację na mapie, aby wykonać audyt 4 operatorów.');
                }
              }}
            >
              <Radar size={19} />
            </button>
            <button className="map-tool" aria-label="Moja lokalizacja" title="Moja lokalizacja" disabled={locating} onClick={locate}><LocateFixed size={20}/></button>
            <button
              className="map-tool"
              aria-label="Dodaj nową stację"
              title="Dodaj nową stację bazową dla wybranego operatora"
              onClick={() => openCreateStation(null)}
            >
              <RadioTower size={19} />
            </button>
            <button className="map-tool fullscreen-tool" aria-label="Pełny ekran mapy" title="Pełny ekran" onClick={()=>void fullscreen()}><Maximize size={19}/></button>
          </div>
          <BasemapPicker value={basemap} onChange={setBasemap}/>
          <div className="map-legend" aria-label="Operatorzy">{OPERATORS.slice(0,4).map(op=><button key={op.name} aria-label={`Filtruj operatora ${op.name}`} aria-pressed={filters.operators.includes(op.name)} onClick={()=>changeFilters({...filters,operators:filters.operators.length===1&&filters.operators[0]===op.name?[]:[op.name]})}><i style={{background:op.color}}/>{op.name}</button>)}</div>
          {panel==='filters'&&filterPanel}
          {panel==='stations'&&<aside className="floating-panel stations-drawer" aria-label="Stacje w obszarze"><div className="floating-panel-heading"><div><h2>Stacje w obszarze</h2><p>Pozwolenia UKE · {formatNumber(result.total)} lokalizacji</p></div><button className="icon-button" aria-label="Zamknij listę stacji" onClick={()=>setPanel(null)}><X size={19}/></button></div><div className="panel-scroll"><TowerList items={result.items} total={result.total} loading={loading} error={error} selected={selected?.id} onSelect={selectTower} onRetry={()=>setRefresh(r=>r+1)} hasMore={result.hasMore}/></div></aside>}
          {selected&&<DetailsPanel key={selected.id} tower={selected} onClose={closeTower} onNotice={setNotice} onOpenCreateStation={openCreateStation} onOpenTerrainProfile={openTerrainProfile} onOpenAreaEvaluation={openAreaEvaluation}/>}
        </div>:<div className="page-workspace">{view==='database'?<><div className="database-filter-action"><button className="secondary-button" aria-expanded={panel==='filters'} onClick={()=>togglePanel('filters')}><SlidersHorizontal size={16}/>Filtry{filterTotal?` (${filterTotal})`:''}</button></div><DatabaseView result={result} loading={loading} error={error} query={query} onQuery={q=>{setQuery(q);setPage(0);}} page={page} onPage={setPage} onSelect={openOnMap} onRetry={()=>setRefresh(r=>r+1)}/>{panel==='filters'&&filterPanel}</>:view==='changelog'?<ChangelogView/>:view==='stats'?<StatsView health={health} error={healthError} onRetry={loadHealth}/>:view==='guides'?<GuidesView/>:user?.role==='ADMIN'?<AdminView user={user} onUpdate={()=>setRefresh(r=>r+1)}/>:<div className="empty-state"><h2>Panel wymaga konta administratora</h2><button className="primary-button" onClick={()=>changeView('map')}>Wróć do mapy</button></div>}</div>}
      </main>
    </section>
    {notice&&<div className="toast" role="status"><Info size={19}/><span>{notice}</span><button className="icon-button" aria-label="Zamknij komunikat" onClick={()=>setNotice('')}><X size={17}/></button></div>}
    {dialog==='auth'&&<AuthDialog onClose={()=>setDialog(null)} authenticate={handleAuth}/>}
    {dialog==='profile'&&user&&<ProfileDialog user={user} onClose={()=>setDialog(null)} onLogout={async()=>{await logout();setDialog(null);if(view==='admin')setView('map');}} onAdmin={()=>{setDialog(null);changeView('admin');}}/>}
    {dialog==='submit'&&user&&editTower&&<SubmitDialog tower={editTower} onClose={()=>setDialog(null)} onSuccess={()=>setRefresh(r=>r+1)}/>}
    {createStationTower!==null&&<StationSubmissionDialog sourceTower={createStationTower==='blank'?null:createStationTower} onClose={()=>setCreateStationTower(null)} onSuccess={()=>{setCreateStationTower(null);setRefresh(r=>r+1);setNotice('Zgłoszenie nowej stacji zostało pomyślnie wysłane do moderacji.');}}/>}
    {terrainTower!==null&&terrainTarget!==null&&<TerrainProfileDialog tower={terrainTower} targetCoords={terrainTarget} onTargetChange={setTerrainTarget} onSectorAzimuthChange={setTerrainSectorAzimuth} onPickOnMap={()=>setIsPickingTerrainTarget(true)} onClose={closeTerrainProfile}/>}
    {evalTarget!==null&&<AreaEvaluationDialog targetCoords={evalTarget} radiusM={evalRadiusM} onRadiusChange={setEvalRadiusM} onPickOnMap={()=>setIsPickingEvalTarget(true)} onClose={closeAreaEvaluation} onOpenTerrainProfile={openTerrainProfile}/>}
  </div>;
}
