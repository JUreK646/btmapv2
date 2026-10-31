import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  RadioTower,
  Waypoints,
} from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';

interface KmzCatalogItem {
  id: string;
  scope: 'all' | 'new' | 'province';
  province?: string;
  title: string;
  count: number;
  sizeBytes: number;
  sizeText: string;
  filename: string;
}

interface KmzCatalogResponse {
  type: 'stations' | 'radiolines';
  source: 'ALL' | 'UKE' | 'BTMAP';
  snapshotDate: string;
  availableDates: string[];
  items: KmzCatalogItem[];
}

const PROVINCE_LIST = [
  'Dolnośląskie',
  'Kujawsko-pomorskie',
  'Lubelskie',
  'Lubuskie',
  'Łódzkie',
  'Małopolskie',
  'Mazowieckie',
  'Opolskie',
  'Podkarpackie',
  'Podlaskie',
  'Pomorskie',
  'Śląskie',
  'Świętokrzyskie',
  'Warmińsko-mazurskie',
  'Wielkopolskie',
  'Zachodniopomorskie',
];

function formatFilesCountPl(n: number, isPl: boolean): string {
  if (!isPl) return `${n} ${n === 1 ? 'file' : 'files'}`;
  if (n === 1) return '1 plik';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} pliki`;
  }
  return `${n} plików`;
}

export default function KmzView() {
  const { lang } = useI18n();
  const isPl = lang === 'pl';

  const [fileType, setFileType] = useState<'stations' | 'radiolines'>('stations');
  const [source, setSource] = useState<'ALL' | 'UKE' | 'BTMAP'>('ALL');
  const [provinceFilter, setProvinceFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'province' | 'size'>('province');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [catalog, setCatalog] = useState<KmzCatalogResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({
      type: fileType,
      source: fileType === 'radiolines' ? 'UKE' : source,
    });
    api<KmzCatalogResponse>(`/kmz/catalog?${params.toString()}`)
      .then(data => {
        if (active) {
          setCatalog(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fileType, source]);

  const visibleItems = useMemo(() => {
    const rawItems = catalog?.items || [];
    if (rawItems.length === 0) return [];

    const filtered =
      provinceFilter === 'ALL'
        ? rawItems
        : rawItems.filter(it => it.scope === 'province' && it.province === provinceFilter);

    if (sortBy === 'province' && sortAsc) {
      // Keep the canonical order: Wszystkie województwa, Nowe stacje, then A-Z provinces
      return filtered;
    }

    const specialItems = filtered.filter(it => it.scope !== 'province');
    const provItems = filtered.filter(it => it.scope === 'province');

    provItems.sort((a, b) => {
      if (sortBy === 'size') {
        return sortAsc ? a.sizeBytes - b.sizeBytes : b.sizeBytes - a.sizeBytes;
      }
      const cmp = a.title.localeCompare(b.title, 'pl');
      return sortAsc ? cmp : -cmp;
    });

    if (sortBy === 'size') {
      const allSorted = [...filtered].sort((a, b) =>
        sortAsc ? a.sizeBytes - b.sizeBytes : b.sizeBytes - a.sizeBytes
      );
      return allSorted;
    }

    return [...specialItems, ...provItems];
  }, [catalog, provinceFilter, sortBy, sortAsc]);

  const buildDownloadUrl = (item: KmzCatalogItem) => {
    const params = new URLSearchParams({
      type: fileType,
      source: fileType === 'radiolines' ? 'UKE' : source,
      scope: item.scope,
    });
    if (item.province) params.set('province', item.province);
    return `/api/kmz/download?${params.toString()}`;
  };

  const handleDownloadClick = (item: KmzCatalogItem) => {
    setDownloadingId(item.id);
    setTimeout(() => {
      setDownloadingId(prev => (prev === item.id ? null : prev));
    }, 1400);
  };

  return (
    <div className="kmz-page">
      <div className="kmz-container">
        {/* Header */}
        <header className="kmz-header">
          <div className="kmz-header-titles">
            <h2>{isPl ? 'Pliki KMZ' : 'KMZ Files'}</h2>
            <p>
              {isPl
                ? 'Gotowe pliki Google Earth wygenerowane z naszych importów rejestru'
                : 'Ready-to-use Google Earth KMZ archives generated from our registry imports'}
            </p>
          </div>
          <div className="kmz-header-meta">
            <span>{formatFilesCountPl(visibleItems.length, isPl)}</span>
          </div>
        </header>

        {/* Controls / Filter Bar */}
        <div className="kmz-toolbar">
          <div className="kmz-control-group">
            <span className="kmz-control-label">{isPl ? 'Typ pliku' : 'File type'}</span>
            <div className="kmz-type-toggle" role="group" aria-label={isPl ? 'Typ pliku' : 'File type'}>
              <button
                type="button"
                className={`kmz-type-btn ${fileType === 'stations' ? 'is-active' : ''}`}
                onClick={() => setFileType('stations')}
              >
                <RadioTower size={15} />
                <span>{isPl ? 'Stacje' : 'Stations'}</span>
              </button>
              <button
                type="button"
                className={`kmz-type-btn ${fileType === 'radiolines' ? 'is-active' : ''}`}
                onClick={() => setFileType('radiolines')}
              >
                <Waypoints size={15} />
                <span>{isPl ? 'Radiolinie' : 'Microwave links'}</span>
              </button>
            </div>
          </div>

          <div className="kmz-toolbar-divider" aria-hidden="true" />

          <div className="kmz-control-group">
            <label className="kmz-control-label" htmlFor="kmz-source-select">
              {isPl ? 'Źródło' : 'Source'}
            </label>
            <div className="kmz-select-wrap">
              <select
                id="kmz-source-select"
                className="kmz-select"
                value={fileType === 'radiolines' ? 'UKE' : source}
                disabled={fileType === 'radiolines'}
                onChange={e => setSource(e.target.value as 'ALL' | 'UKE' | 'BTMAP')}
              >
                <option value="ALL">{isPl ? 'Połączone' : 'Combined'}</option>
                <option value="UKE">{isPl ? 'Rejestr UKE' : 'UKE Registry'}</option>
                <option value="BTMAP">{isPl ? 'Baza BTMap' : 'BTMap Database'}</option>
              </select>
              <ChevronsUpDown size={13} className="kmz-select-icon" />
            </div>
          </div>

          <div className="kmz-control-group">
            <label className="kmz-control-label" htmlFor="kmz-date-select">
              {isPl ? 'Data' : 'Date'}
            </label>
            <div className="kmz-select-wrap">
              <select
                id="kmz-date-select"
                className="kmz-select"
                value={catalog?.snapshotDate || ''}
                onChange={() => {}}
              >
                {(catalog?.availableDates?.length ? catalog.availableDates : [catalog?.snapshotDate || '']).map(dt => (
                  <option key={dt} value={dt}>
                    {dt}
                  </option>
                ))}
              </select>
              <ChevronsUpDown size={13} className="kmz-select-icon" />
            </div>
          </div>

          <div className="kmz-control-group">
            <label className="kmz-control-label" htmlFor="kmz-prov-select">
              {isPl ? 'Województwo' : 'Province'}
            </label>
            <div className="kmz-select-wrap kmz-select-wide">
              <select
                id="kmz-prov-select"
                className="kmz-select"
                value={provinceFilter}
                onChange={e => setProvinceFilter(e.target.value)}
              >
                <option value="ALL">
                  {isPl ? 'Wszystkie województwa' : 'All provinces'}
                </option>
                {PROVINCE_LIST.map(prov => (
                  <option key={prov} value={prov}>
                    {prov}
                  </option>
                ))}
              </select>
              <ChevronsUpDown size={13} className="kmz-select-icon" />
            </div>
          </div>

          <div className="kmz-control-group">
            <label className="kmz-control-label" htmlFor="kmz-sort-select">
              {isPl ? 'Sortowanie' : 'Sort by'}
            </label>
            <div className="kmz-select-wrap">
              <select
                id="kmz-sort-select"
                className="kmz-select"
                value={sortBy}
                onChange={e => setSortBy(e.target.value as 'province' | 'size')}
              >
                <option value="province">{isPl ? 'Województwo' : 'Province'}</option>
                <option value="size">{isPl ? 'Rozmiar' : 'File size'}</option>
              </select>
              <ChevronsUpDown size={13} className="kmz-select-icon" />
            </div>
          </div>

          <div className="kmz-control-group">
            <span className="kmz-control-label">{isPl ? 'Kolejność' : 'Order'}</span>
            <button
              type="button"
              className="kmz-order-btn"
              onClick={() => setSortAsc(prev => !prev)}
            >
              {sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              <span>{sortAsc ? (isPl ? 'Rosnąco' : 'Ascending') : isPl ? 'Malejąco' : 'Descending'}</span>
            </button>
          </div>
        </div>

        {/* 3-Column Files List */}
        {loading && !catalog ? (
          <div className="kmz-loading">
            {isPl ? 'Wczytywanie listy plików KMZ…' : 'Loading KMZ file catalog…'}
          </div>
        ) : (
          <div
            className={`kmz-grid ${
              visibleItems.length === 18 && sortBy === 'province' && sortAsc ? 'is-column-flow' : ''
            }`}
          >
            {visibleItems.map(item => {
              const titleDisplay =
                !isPl && item.scope === 'all'
                  ? 'All provinces'
                  : !isPl && item.scope === 'new'
                  ? fileType === 'radiolines'
                    ? 'New microwave links'
                    : 'New stations'
                  : item.title;

              return (
                <div key={item.id} className="kmz-row">
                  <div className="kmz-row-info">
                    <strong className="kmz-row-title">{titleDisplay}</strong>
                    <span className="kmz-row-size">{item.sizeText}</span>
                  </div>
                  <a
                    href={buildDownloadUrl(item)}
                    download={item.filename}
                    className={`kmz-download-btn ${downloadingId === item.id ? 'is-downloading' : ''}`}
                    onClick={() => handleDownloadClick(item)}
                  >
                    <Download size={13} />
                    <span>{isPl ? 'Pobierz' : 'Download'}</span>
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
