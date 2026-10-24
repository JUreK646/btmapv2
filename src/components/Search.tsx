import {useEffect,useRef,useState} from 'react';
import {Search as SearchIcon,ArrowRight,MapPin,X} from 'lucide-react';
import type {Tower,TowerResult} from '../types';
import {api} from '../lib/api';

export interface SearchProps {
  onSelect: (t: Tower) => void;
  onPlace: (lat: number, lng: number) => void;
  onError: (message: string) => void;
  onActiveChange?: (active: boolean) => void;
}

export default function Search({onSelect,onPlace,onError,onActiveChange}:SearchProps){
  const [query,setQuery]=useState('');
  const [items,setItems]=useState<Tower[]>([]);
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [isFocused,setIsFocused]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{
    const active = isFocused || open || query.trim().length > 0;
    onActiveChange?.(active);
  },[isFocused,open,query,onActiveChange]);

  useEffect(()=>{
    const close=(e:MouseEvent)=>{
      if(!ref.current?.contains(e.target as Node)){
        setOpen(false);
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown',close);
    return()=>document.removeEventListener('mousedown',close);
  },[]);

  useEffect(()=>{
    if(query.trim().length<2){
      setItems([]);
      setLoading(false);
      return;
    }
    const abort=new AbortController();
    setLoading(true);
    const timer=setTimeout(()=>
      api<TowerResult>(`/towers?q=${encodeURIComponent(query)}&limit=5`,{signal:abort.signal})
        .then(r=>{setItems(r.items);setLoading(false);})
        .catch(e=>{if(e.name!=='AbortError'){setItems([]);setLoading(false);}}),
      350
    );
    return()=>{clearTimeout(timer);abort.abort();};
  },[query]);

  const dismissSearch=()=>{
    setOpen(false);
    setIsFocused(false);
    inputRef.current?.blur();
  };

  const handleSelect=(t:Tower)=>{
    onSelect(t);
    dismissSearch();
  };

  const findPlace=async()=>{
    if(!query.trim()||busy)return;
    setBusy(true);
    try{
      const coordinates=query.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)\s*$/);
      if(coordinates){
        const lat=Number(coordinates[1]),lng=Number(coordinates[2]);
        if(Math.abs(lat)>90||Math.abs(lng)>180)throw new Error('Nieprawidłowe współrzędne.');
        onPlace(lat,lng);
        dismissSearch();
        return;
      }
      if(items.length){
        onPlace(items[0].lat,items[0].lng);
        dismissSearch();
        return;
      }
      const response=await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=pl&limit=1&q=${encodeURIComponent(query)}`,{signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('Wyszukiwanie miejsc jest chwilowo niedostępne. Spróbuj nazwy stacji lub współrzędnych.');
      const results=await response.json();
      if(!results.length)throw new Error('Nie znaleziono miejsca. Spróbuj pełnej nazwy miasta lub współrzędnych.');
      onPlace(Number(results[0].lat),Number(results[0].lon));
      dismissSearch();
    }catch(e){
      onError((e as Error).message);
    }finally{
      setBusy(false);
    }
  };

  return (
    <div className="search-container" ref={ref}>
      <form className="search-box" onSubmit={e=>{e.preventDefault();void findPlace();}}>
        <SearchIcon size={18} aria-hidden="true"/>
        <input
          ref={inputRef}
          aria-label="Szukaj miejscowości, adresu lub ID stacji"
          placeholder={isFocused ? 'Wpisz miejscowość, adres lub ID stacji…' : 'Miejscowość, stacja…'}
          value={query}
          onFocus={()=>{setIsFocused(true);setOpen(true);}}
          onBlur={()=>setIsFocused(false)}
          onChange={e=>{setQuery(e.target.value);setOpen(true);}}
          onKeyDown={e=>{
            if(e.key==='Escape'){
              dismissSearch();
            }
          }}
        />
        {query ? (
          <button
            type="button"
            className="search-clear-button"
            aria-label="Wyczyść wyszukiwanie"
            onClick={()=>{
              setQuery('');
              dismissSearch();
            }}
          >
            <X size={15}/>
          </button>
        ) : (
          <kbd>↵</kbd>
        )}
      </form>
      {open && query.trim().length>=2 && (
        <div className="search-results">
          <span className="search-label">{loading?'Szukam stacji…':items.length?'Stacje w bazie':'Brak pasujących stacji'}</span>
          {items.map(t=>(
            <button key={t.id} onClick={()=>handleSelect(t)}>
              <MapPin size={16}/>
              <span>
                <strong>{t.address}</strong>
                <small>{t.operators.map(o=>o.name).join(' · ')} · {t.stationId}</small>
              </span>
              <ArrowRight size={14}/>
            </button>
          ))}
          <button className="place-result" disabled={busy} onClick={()=>void findPlace()}>
            <SearchIcon size={16}/>
            {busy?'Szukam miejsca…':'Znajdź na mapie'}
            <ArrowRight size={14}/>
          </button>
        </div>
      )}
    </div>
  );
}
