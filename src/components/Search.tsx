import { useEffect, useMemo, useRef, useState } from 'react';
import { Search as SearchIcon, ArrowRight, MapPin, X, Radio, Compass } from 'lucide-react';
import type { Tower, TowerResult } from '../types';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { parseCellSearch, resolveSectorAzimuth } from '../../shared/cellSearch';

export interface SectorSelection {
  azimuth: number;
  sectorNum?: number;
  cellId?: number;
  eci?: number;
  label?: string;
}

export interface SearchProps {
  onSelect: (t: Tower, sector?: SectorSelection) => void;
  onPlace: (lat: number, lng: number) => void;
  onError: (message: string) => void;
  onActiveChange?: (active: boolean) => void;
}

export default function Search({ onSelect, onPlace, onError, onActiveChange }: SearchProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Tower[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsedCell = useMemo(() => parseCellSearch(query), [query]);

  useEffect(() => {
    const active = isFocused || open || query.trim().length > 0;
    onActiveChange?.(active);
  }, [isFocused, open, query, onActiveChange]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    const abort = new AbortController();
    setLoading(true);
    const timer = setTimeout(
      () =>
        api<TowerResult>(`/towers?q=${encodeURIComponent(query)}&limit=6`, { signal: abort.signal })
          .then(r => {
            setItems(r.items);
            setLoading(false);
          })
          .catch(e => {
            if (e.name !== 'AbortError') {
              setItems([]);
              setLoading(false);
            }
          }),
      300
    );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query]);

  const dismissSearch = () => {
    setOpen(false);
    setIsFocused(false);
    inputRef.current?.blur();
  };

  const handleSelect = (tower: Tower, sector?: SectorSelection) => {
    onSelect(tower, sector);
    dismissSearch();
  };

  const findPlace = async () => {
    if (!query.trim() || busy) return;
    setBusy(true);
    try {
      const coordinates = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (coordinates) {
        const lat = Number(coordinates[1]);
        const lng = Number(coordinates[2]);
        if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error(t.searchInvalidCoords);
        onPlace(lat, lng);
        dismissSearch();
        return;
      }
      if (items.length) {
        let sectorSelection: SectorSelection | undefined;
        if (parsedCell?.sectorNum && items[0].azimuths?.length) {
          const sec = resolveSectorAzimuth(items[0].azimuths, parsedCell.sectorNum);
          if (sec) {
            sectorSelection = {
              azimuth: sec.azimuth,
              sectorNum: sec.sectorNum,
              cellId: parsedCell.cellId,
              eci: parsedCell.eci,
              label: parsedCell.displaySummary,
            };
          }
        }
        handleSelect(items[0], sectorSelection);
        return;
      }
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&countrycodes=pl&limit=1&q=${encodeURIComponent(
          query
        )}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!response.ok) throw new Error(t.searchServiceUnavailable);
      const results = await response.json();
      if (!results.length) throw new Error(t.searchPlaceNotFound);
      onPlace(Number(results[0].lat), Number(results[0].lon));
      dismissSearch();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="search-container" ref={ref}>
      <form
        className="search-box"
        onSubmit={e => {
          e.preventDefault();
          void findPlace();
        }}
      >
        <SearchIcon size={18} aria-hidden="true" />
        <input
          ref={inputRef}
          aria-label={t.searchAria}
          placeholder={isFocused ? t.searchPlaceholderFocused : t.searchPlaceholder}
          value={query}
          onFocus={() => {
            setIsFocused(true);
            setOpen(true);
          }}
          onBlur={() => setIsFocused(false)}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              dismissSearch();
            }
          }}
        />
        {query ? (
          <button
            type="button"
            className="search-clear-button"
            aria-label={t.clear}
            onClick={() => {
              setQuery('');
              dismissSearch();
            }}
          >
            <X size={15} />
          </button>
        ) : (
          <kbd>↵</kbd>
        )}
      </form>
      {open && query.trim().length >= 2 && (
        <div className="search-results">
          {parsedCell?.isCellIdQuery && (
            <div className="search-cell-banner">
              <span className="search-cell-pulse">
                <Radio size={14} />
              </span>
              <div className="search-cell-meta">
                <div className="search-cell-badges">
                  <span className="search-cell-badge">{parsedCell.type === 'NR' ? '5G NR' : '4G LTE'}</span>
                  <span className="search-cell-sub">{t.searchCellIdHeader}</span>
                </div>
                <strong>{parsedCell.displaySummary}</strong>
              </div>
            </div>
          )}

          <span className="search-label">
            {loading
              ? t.filterLoading
              : items.length
              ? parsedCell?.isCellIdQuery
                ? 'Dopasowane stacje bazowe i sektory:'
                : t.language === 'Język'
                ? 'Stacje w bazie'
                : 'Stations in database'
              : parsedCell?.isCellIdQuery
              ? 'Nie znaleziono stacji dla tego numeru eNodeB/CID'
              : t.language === 'Język'
              ? 'Brak pasujących stacji'
              : 'No matching stations'}
          </span>

          {items.map(tower => {
            const sectorInfo =
              parsedCell?.sectorNum && tower.azimuths?.length
                ? resolveSectorAzimuth(tower.azimuths, parsedCell.sectorNum)
                : null;

            const sectorSelection: SectorSelection | undefined = sectorInfo
              ? {
                  azimuth: sectorInfo.azimuth,
                  sectorNum: sectorInfo.sectorNum,
                  cellId: parsedCell?.cellId,
                  eci: parsedCell?.eci,
                  label: parsedCell?.displaySummary,
                }
              : undefined;

            return (
              <button
                key={tower.id}
                className={`search-tower-item ${sectorInfo ? 'has-sector-match' : ''}`}
                onClick={() => handleSelect(tower, sectorSelection)}
              >
                <MapPin size={16} />
                <span>
                  <strong className="search-tower-title">
                    {tower.address || t.dbNoAddress}
                    {sectorInfo && (
                      <span className="search-sector-pill" title={`Kierunek sektora anteny: ${sectorInfo.azimuth}°`}>
                        <Compass size={11} /> Sektor {sectorInfo.sectorNum} ({sectorInfo.azimuth}°)
                      </span>
                    )}
                  </strong>
                  <small>
                    {tower.operators.map(o => o.name).join(' · ')} · {tower.stationId || tower.id}
                  </small>
                </span>
                <ArrowRight size={14} />
              </button>
            );
          })}

          <button className="place-result" disabled={busy} onClick={() => void findPlace()}>
            <SearchIcon size={16} />
            {busy
              ? t.language === 'Język'
                ? 'Szukam miejsca…'
                : 'Searching location…'
              : t.language === 'Język'
              ? 'Znajdź na mapie'
              : 'Find on map'}
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
