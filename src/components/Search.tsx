import { useEffect, useMemo, useRef, useState } from 'react';
import { Search as SearchIcon, ArrowRight, MapPin, X, Radio, Compass, Navigation } from 'lucide-react';
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

export interface PlaceSuggestion {
  id: string;
  name: string;
  displayName: string;
  type: string;
  lat: number;
  lng: number;
}

function formatPlaceType(type: string): string {
  switch (type.toLowerCase()) {
    case 'city':
    case 'administrative':
      return 'Miasto';
    case 'town':
      return 'Miejscowość';
    case 'village':
      return 'Wieś';
    case 'suburb':
    case 'neighbourhood':
      return 'Dzielnica';
    case 'road':
    case 'street':
    case 'residential':
    case 'pedestrian':
      return 'Ulica';
    default:
      return 'Lokalizacja';
  }
}

export default function Search({ onSelect, onPlace, onError, onActiveChange }: SearchProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Tower[]>([]);
  const [places, setPlaces] = useState<PlaceSuggestion[]>([]);
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
    const cleanQ = query.trim();
    if (cleanQ.length < 2) {
      setItems([]);
      setPlaces([]);
      setLoading(false);
      return;
    }

    const abort = new AbortController();
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        // 1. Fetch matching base stations from database
        const towersPromise = api<TowerResult>(`/towers?q=${encodeURIComponent(cleanQ)}&limit=5`, {
          signal: abort.signal,
        })
          .then(r => r.items)
          .catch(e => {
            if (e.name === 'AbortError') throw e;
            return [] as Tower[];
          });

        // 2. Fetch matching cities, towns, and streets from OpenStreetMap Nominatim
        const placesPromise = (!parsedCell?.isCellIdQuery
          ? fetch(
              `https://nominatim.openstreetmap.org/search?format=json&countrycodes=pl&limit=4&addressdetails=1&q=${encodeURIComponent(
                cleanQ
              )}`,
              {
                signal: abort.signal,
                headers: { Accept: 'application/json' },
              }
            )
              .then(res => (res.ok ? res.json() : []))
              .then((rawPlaces: Array<Record<string, unknown>>) =>
                rawPlaces.map(p => {
                  const rawName = String(p.name || String(p.display_name).split(',')[0] || '').trim();
                  const rawDisplay = String(p.display_name || '').trim();
                  return {
                    id: String(p.place_id || `${p.lat}-${p.lon}`),
                    name: rawName,
                    displayName: rawDisplay,
                    type: String(p.type || p.addresstype || 'miejsce'),
                    lat: Number(p.lat),
                    lng: Number(p.lon),
                  };
                })
              )
              .catch(e => {
                if (e.name === 'AbortError') throw e;
                return [] as PlaceSuggestion[];
              })
          : Promise.resolve([] as PlaceSuggestion[]));

        const [fetchedTowers, fetchedPlaces] = await Promise.all([towersPromise, placesPromise]);
        if (!abort.signal.aborted) {
          setItems(fetchedTowers);
          setPlaces(fetchedPlaces);
          setLoading(false);
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setLoading(false);
        }
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, parsedCell]);

  const dismissSearch = () => {
    setOpen(false);
    setIsFocused(false);
    inputRef.current?.blur();
  };

  const handleSelect = (tower: Tower, sector?: SectorSelection) => {
    onSelect(tower, sector);
    dismissSearch();
  };

  const handleSelectPlace = (place: PlaceSuggestion) => {
    onPlace(place.lat, place.lng);
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
      if (places.length) {
        handleSelectPlace(places[0]);
        return;
      }
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&countrycodes=pl&limit=1&q=${encodeURIComponent(
          query
        )}`,
        { signal: AbortSignal.timeout(8000) }
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
          placeholder={isFocused ? 'Wpisz miasto, ulicę, stację lub gNB/eNB...' : t.searchPlaceholder}
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
              setItems([]);
              setPlaces([]);
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

          {/* Stacje bazowe section */}
          {items.length > 0 && (
            <>
              <span className="search-label">
                {parsedCell?.isCellIdQuery ? 'Dopasowane stacje bazowe:' : 'Stacje bazowe (BTS):'}
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
                    type="button"
                    className={`search-tower-item ${sectorInfo ? 'has-sector-match' : ''}`}
                    onClick={() => handleSelect(tower, sectorSelection)}
                  >
                    <Radio size={16} style={{ color: 'var(--accent, #2582eb)' }} />
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
            </>
          )}

          {/* Miejscowości i ulice section */}
          {places.length > 0 && (
            <>
              <span className="search-label" style={{ marginTop: items.length > 0 ? '6px' : '0' }}>
                Miejscowości i ulice:
              </span>
              {places.map(place => (
                <button
                  key={place.id}
                  type="button"
                  className="search-place-item"
                  onClick={() => handleSelectPlace(place)}
                >
                  <MapPin size={16} style={{ color: '#10b981' }} />
                  <span>
                    <strong className="search-tower-title">
                      {place.name}
                      <span className="search-place-type-pill">{formatPlaceType(place.type)}</span>
                    </strong>
                    <small>{place.displayName}</small>
                  </span>
                  <Navigation size={13} style={{ opacity: 0.7 }} />
                </button>
              ))}
            </>
          )}

          {loading && items.length === 0 && places.length === 0 && (
            <span className="search-label">{t.filterLoading}</span>
          )}

          {!loading && items.length === 0 && places.length === 0 && (
            <span className="search-label">
              {parsedCell?.isCellIdQuery
                ? 'Nie znaleziono stacji dla tego numeru eNodeB/CID'
                : 'Brak pasujących stacji i miejscowości'}
            </span>
          )}

          <button type="button" className="place-result" disabled={busy} onClick={() => void findPlace()}>
            <SearchIcon size={16} />
            <span>
              {busy ? 'Szukam miejsca…' : 'Szukaj lokalizacji na mapie'}
            </span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
