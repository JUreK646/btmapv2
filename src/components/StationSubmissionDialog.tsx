import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  X,
  Plus,
  Trash2,
  Copy,
  AlertCircle,
  CheckCircle2,
  Send,
  Building,
  Building2,
  MapPin,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Check,
  Image as ImageIcon,
  Upload,
  Locate,
  RadioTower,
  Keyboard,
  Wand2,
  FilePen,
  Info,
  Signal,
  Compass,
  RefreshCw,
} from 'lucide-react';
import type { Tower } from '../types';
import { post } from '../lib/api';
import { cachedPemReports, loadPemReports, loadPemPdf } from '../lib/pemCache';
import type { PemAntenna } from '../../shared/pem';
import { OPERATORS, operatorColor, operatorName } from '../../shared/operators';
import {
  RatTech,
  CellInput,
  validateCell,
  calculateEci,
  getAvailableBandsForOperator,
  findBandAllocation,
  POLISH_BAND_PLAN,
} from '../../shared/cellValidation';

const PROVINCES = [
  'Dolnośląskie', 'Kujawsko-pomorskie', 'Lubelskie', 'Lubuskie', 'Łódzkie', 'Małopolskie',
  'Mazowieckie', 'Opolskie', 'Podkarpackie', 'Podlaskie', 'Pomorskie', 'Śląskie',
  'Świętokrzyskie', 'Warmińsko-mazurskie', 'Wielkopolskie', 'Zachodniopomorskie',
];

const MAST_TYPES = [
  'Nieznany',
  'Wieża kratowa',
  'Wieża rurowa',
  'Wieża strunobetonowa',
  'Maszt z odciągami',
  'Dach budynku',
  'Komin',
  'Wieża kościoła',
  'Silos / elewator',
  'Słup oświetleniowy / energetyczny',
  'Wewnątrz budynku',
  'Inny',
];

const OWNERS = ['Nieznany', 'Cellnex / Towerlink', 'Emitel', 'Orange', 'Play', 'Plus', 'T-Mobile', 'Własny'];
const BACKHAUL_OPTIONS = ['Nieznany', 'Radiolinia', 'Światłowód'];
const CELL_TYPES = ['macro', 'micro', 'indoor'] as const;
const MAX_AZIMUTHS = 15;
const MAX_PHOTOS = 10;

const RAT_ORDER: RatTech[] = ['5G', 'LTE', 'UMTS', 'GSM'];
const RAT_META: Record<RatTech, { gen: string; short: string }> = {
  '5G': { gen: '5G', short: 'NR' },
  LTE: { gen: '4G', short: 'LTE' },
  UMTS: { gen: '3G', short: 'UMTS' },
  GSM: { gen: '2G', short: 'GSM' },
};

const FIELD_LABELS: Record<string, string> = {
  band: 'Pasmo',
  pci: 'PCI',
  earfcn: 'Kanał',
  cellId: 'CID',
  nodeId: 'eNBID',
  azimuth: 'Azymut',
  lac: 'LAC',
  tac: 'TAC',
  tech: 'Technologia',
};

function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  if (d >= 2 && d <= 4 && (t < 12 || t > 14)) return few;
  return many;
}

const newId = () => 'c_' + Math.random().toString(36).slice(2, 10);

/** Extracts the MHz number (e.g. 700, 800, 900, 1800, 2100, 2600, 3500) without concatenating band codes like (B20). */
export function bandFreq(band: string): number {
  const cleaned = String(band || '').replace(/^[2345]g\b/i, '');
  const m = cleaned.match(/\d{3,4}/) || cleaned.match(/\d+/);
  return m ? Number(m[0]) : 0;
}

function sameFreq(a: number, b: number): boolean {
  if (a === b) return true;
  if ((a === 3500 || a === 3600) && (b === 3500 || b === 3600)) return true;
  return false;
}

function sortCellsByBand(list: CellInput[]): CellInput[] {
  return [...list].sort((a, b) => {
    if (a.tech !== b.tech) return RAT_ORDER.indexOf(a.tech) - RAT_ORDER.indexOf(b.tech);
    const fa = bandFreq(a.band);
    const fb = bandFreq(b.band);
    if (fa !== fb) {
      if (!fa) return 1;
      if (!fb) return -1;
      return fa - fb;
    }
    const azA = String(a.azimuth ?? '') === '' ? 9999 : Number(a.azimuth);
    const azB = String(b.azimuth ?? '') === '' ? 9999 : Number(b.azimuth);
    return azA - azB;
  });
}

interface SectorConfig {
  id: string;
  azimuth: string;
  freqs: number[];
}

interface UkePermitBand {
  tech: RatTech;
  freq: number;
  label: string;
}

interface Props {
  sourceTower?: Tower | null;
  onClose: () => void;
  onSuccess: () => void;
}

function MapController({ center, onPick }: { center: [number, number]; onPick: (lat: number, lng: number) => void }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  }, [center[0], center[1], map]);
  useMapEvents({ click: e => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function SelectBox({
  value,
  onChange,
  children,
  display,
  icon,
  className = '',
  invalid = false,
  chevron = 'updown',
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  display?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  invalid?: boolean;
  chevron?: 'updown' | 'down';
}) {
  return (
    <div className={`ss-select ${invalid ? 'is-invalid' : ''} ${className}`}>
      {icon && <span className="ss-select-icon">{icon}</span>}
      <span className="ss-select-value">{display ?? value}</span>
      {chevron === 'updown' ? <ChevronsUpDown size={13} className="ss-select-chev" /> : <ChevronDown size={14} className="ss-select-chev" />}
      <select value={value} onChange={e => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}

export default function StationSubmissionDialog({ sourceTower, onClose, onSuccess }: Props) {
  const initialOperator = useMemo(
    () => (sourceTower?.operators?.[0]?.name ? operatorName(sourceTower.operators[0].name) : 'Plus'),
    [sourceTower]
  );

  const [stationMode, setStationMode] = useState<'new' | 'existing'>('new');
  const [showUkeLocations, setShowUkeLocations] = useState(Boolean(sourceTower));
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showErrorList, setShowErrorList] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Station
  const [operator, setOperator] = useState(initialOperator);
  const [stationId, setStationId] = useState(sourceTower?.stationId || '');
  const [stationName, setStationName] = useState('');
  const [backhaul, setBackhaul] = useState('Nieznany');
  const [notes, setNotes] = useState(sourceTower?.notes || '');

  // Location
  const [lat, setLat] = useState(sourceTower?.lat ? sourceTower.lat.toFixed(6) : '52.230000');
  const [lng, setLng] = useState(sourceTower?.lng ? sourceTower.lng.toFixed(6) : '21.010000');
  const [province, setProvince] = useState(sourceTower?.province || 'Mazowieckie');
  const [city, setCity] = useState(() => (sourceTower?.address ? sourceTower.address.split(',')[0].trim() : ''));
  const [address, setAddress] = useState(() => {
    const parts = (sourceTower?.address || '').split(',');
    return parts.length > 1 ? parts.slice(1).join(',').trim() : '';
  });
  const [mastType, setMastType] = useState(sourceTower?.mastType || 'Nieznany');
  const [owner, setOwner] = useState('Nieznany');
  const [mastDescription, setMastDescription] = useState('');
  const [geoBusy, setGeoBusy] = useState(false);

  // Sectors & Azimuths
  const [azimuthsOpen, setAzimuthsOpen] = useState(true);
  const [sectors, setSectors] = useState<SectorConfig[]>([]);
  const [pemStatus, setPemStatus] = useState<'idle' | 'loading' | 'loaded' | 'none'>('idle');
  const [pemAntennas, setPemAntennas] = useState<PemAntenna[]>([]);

  // Photos
  const [photosOpen, setPhotosOpen] = useState(true);
  const [photos, setPhotos] = useState<{ url: string; name: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // RAT
  const [activeTechs, setActiveTechs] = useState<Record<RatTech, boolean>>({ '5G': false, LTE: true, UMTS: false, GSM: false });
  const [techOpen, setTechOpen] = useState<Record<RatTech, boolean>>({ '5G': true, LTE: true, UMTS: true, GSM: true });
  const [cells, setCells] = useState<CellInput[]>([]);
  const [lteTac, setLteTac] = useState('');
  const [umtsRnc, setUmtsRnc] = useState('');
  const [umtsLac, setUmtsLac] = useState('');
  const [gsmLac, setGsmLac] = useState('');

  // Submit
  const [editorNote, setEditorNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isDone, setIsDone] = useState(false);

  // Extract unique UKE bands for the selected operator, sorted lowest -> highest MHz
  const ukePermitBands = useMemo<UkePermitBand[]>(() => {
    const opEntry = sourceTower?.operators?.find(o => operatorName(o.name) === operator) || sourceTower?.operators?.[0];
    if (!opEntry?.bands?.length) return [];
    const map = new Map<string, UkePermitBand>();
    for (const b of opEntry.bands) {
      const raw = b.tech.toUpperCase();
      let t: RatTech | null = null;
      if (raw === 'NR' || raw === '5G') t = '5G';
      else if (raw === 'LTE' || raw === '4G') t = 'LTE';
      else if (raw === 'UMTS' || raw === '3G') t = 'UMTS';
      else if (raw === 'GSM' || raw === '2G') t = 'GSM';
      if (!t) continue;
      const freq = bandFreq(b.band);
      if (!freq) continue;
      const alloc = POLISH_BAND_PLAN.find(
        p => p.tech === t && sameFreq(p.freqMhz, freq) && (p.duplex === 'FDD' || freq === 3500 || freq === 3600)
      );
      const label = alloc?.label || String(b.band);
      const key = `${t}:${alloc?.freqMhz || freq}`;
      if (!map.has(key)) {
        map.set(key, { tech: t, freq: alloc?.freqMhz || freq, label });
      }
    }
    return [...map.values()].sort((a, b) => a.freq - b.freq || RAT_ORDER.indexOf(a.tech) - RAT_ORDER.indexOf(b.tech));
  }, [sourceTower, operator]);

  const ukeUniqueFreqs = useMemo(() => {
    const set = new Set<number>(ukePermitBands.map(b => b.freq));
    return [...set].sort((a, b) => a - b);
  }, [ukePermitBands]);

  const ukeAzimuths = useMemo(() => {
    const set = new Set<number>();
    for (const op of sourceTower?.operators || []) {
      for (const b of op.bands || []) if (typeof b.azimuth === 'number') set.add(b.azimuth);
    }
    return [...set].sort((a, b) => a - b);
  }, [sourceTower]);

  // Build cells from sectors + UKE permit bands while preserving any existing user edits (eNBID, CLID, PCI, EARFCN)
  const buildCellsFromSectors = (nextSectors: SectorConfig[], permitBands: UkePermitBand[], prevCells: CellInput[]) => {
    if (!permitBands.length) {
      return prevCells.length
        ? sortCellsByBand(prevCells)
        : [{ id: newId(), tech: 'LTE' as RatTech, band: '', azimuth: '', pci: '', earfcn: '', nodeId: '', cellId: '', cellType: 'macro' as const, notes: '' }];
    }

    const usedPrevIds = new Set<string>();
    const nextCells: CellInput[] = [];

    for (const pb of permitBands) {
      const matchingSectors = nextSectors.filter(s => s.freqs.some(f => sameFreq(f, pb.freq)));
      for (const sec of matchingSectors) {
        const existing = prevCells.find(
          c => !usedPrevIds.has(c.id!) && c.tech === pb.tech && bandFreq(c.band) === pb.freq && (c.azimuth === sec.azimuth || !c.azimuth)
        );
        if (existing) {
          usedPrevIds.add(existing.id!);
          nextCells.push({ ...existing, band: pb.label, azimuth: sec.azimuth });
        } else {
          nextCells.push({
            id: newId(),
            tech: pb.tech,
            band: pb.label,
            azimuth: sec.azimuth,
            pci: '',
            earfcn: '',
            nodeId: '',
            cellId: '',
            mode: pb.tech === '5G' ? 'NSA' : undefined,
            isIot: false,
            cellType: 'macro',
            notes: '',
          });
        }
      }
    }

    return sortCellsByBand(nextCells);
  };

  // Convert SI2PEM antennas into SectorConfig[]
  const sectorsFromPemAntennas = (antennas: PemAntenna[], defaultFreqs: number[]): SectorConfig[] => {
    const byAz = new Map<number, Set<number>>();
    for (const ant of antennas) {
      if (ant.azimuth === null || !Number.isFinite(ant.azimuth)) continue;
      const az = Math.round(ant.azimuth) % 360;
      if (!byAz.has(az)) byAz.set(az, new Set<number>());
      const set = byAz.get(az)!;
      for (const rawBand of ant.bands || []) {
        const f = bandFreq(rawBand);
        if (f) {
          // Match 3600 in PEM to 3500 if UKE uses 3500
          const canonical = defaultFreqs.find(df => sameFreq(df, f)) ?? f;
          set.add(canonical);
        }
      }
    }
    const sortedAz = [...byAz.keys()].sort((a, b) => a - b);
    if (!sortedAz.length) return [];
    return sortedAz.map(az => {
      const antFreqs = [...(byAz.get(az) || [])].sort((a, b) => a - b);
      return {
        id: newId(),
        azimuth: String(az),
        freqs: antFreqs.length ? antFreqs : [...defaultFreqs],
      };
    });
  };

  // Initialize sectors & cells when sourceTower or operator changes
  useEffect(() => {
    if (!ukePermitBands.length) {
      setSectors([]);
      setCells([{ id: newId(), tech: 'LTE', band: '', azimuth: '', pci: '', earfcn: '', nodeId: '', cellId: '', cellType: 'macro', notes: '' }]);
      setActiveTechs({ '5G': false, LTE: true, UMTS: false, GSM: false });
      return;
    }

    const enabled: Record<RatTech, boolean> = { '5G': false, LTE: false, UMTS: false, GSM: false };
    for (const pb of ukePermitBands) enabled[pb.tech] = true;
    setActiveTechs(enabled);

    // Default to UKE azimuths if present, otherwise 3 sectors (S1, S2, S3)
    const initialAz = ukeAzimuths.length ? ukeAzimuths.map(String) : ['', '', ''];
    const initialSectors: SectorConfig[] = initialAz.map(az => ({
      id: newId(),
      azimuth: az,
      freqs: [...ukeUniqueFreqs],
    }));
    setSectors(initialSectors);
    setCells(buildCellsFromSectors(initialSectors, ukePermitBands, []));
  }, [sourceTower, operator, ukePermitBands, ukeUniqueFreqs, ukeAzimuths]);

  // Automatically check SI2PEM reports for exact sector azimuths and per-sector bands
  useEffect(() => {
    if (!sourceTower || !ukePermitBands.length) {
      setPemStatus('idle');
      setPemAntennas([]);
      return;
    }
    let active = true;
    setPemStatus('loading');

    const run = async () => {
      try {
        const res = cachedPemReports(sourceTower, operator) || (await loadPemReports(sourceTower, operator));
        if (!active) return;
        const pdfEntry = res?.reports?.find(r => r.kind === 'pdf');
        if (!pdfEntry) {
          setPemStatus('none');
          return;
        }
        const parsed = await loadPemPdf(sourceTower, operator, pdfEntry);
        if (!active) return;
        const ants = parsed?.antennas || [];
        setPemAntennas(ants);
        const pemSectors = sectorsFromPemAntennas(ants, ukeUniqueFreqs);
        if (pemSectors.length > 0) {
          setSectors(pemSectors);
          setCells(prev => buildCellsFromSectors(pemSectors, ukePermitBands, prev));
          setPemStatus('loaded');
        } else {
          setPemStatus('none');
        }
      } catch {
        if (active) setPemStatus('none');
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [sourceTower, operator, ukePermitBands, ukeUniqueFreqs]);

  // Close dropdown menus on outside click
  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [openMenu]);

  const mapCenter = useMemo<[number, number]>(() => {
    const a = Number(String(lat).replace(',', '.'));
    const b = Number(String(lng).replace(',', '.'));
    return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : [52.23, 21.01];
  }, [lat, lng]);

  const pickLocation = (a: number, b: number) => {
    setLat(a.toFixed(6));
    setLng(b.toFixed(6));
  };

  const autoAddress = async () => {
    setGeoBusy(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${mapCenter[0]}&lon=${mapCenter[1]}&zoom=18&addressdetails=1&accept-language=pl`
      );
      if (!res.ok) return;
      const data = await res.json();
      const a = data.address || {};
      const town = a.city || a.town || a.village || a.hamlet || a.municipality || '';
      const street = [a.road || a.pedestrian || '', a.house_number || ''].filter(Boolean).join(' ');
      if (town) setCity(town);
      if (street) setAddress(street);
      const state = String(a.state || '').replace(/^województwo\s+/i, '').toLowerCase();
      const match = PROVINCES.find(p => p.toLowerCase() === state);
      if (match) setProvince(match);
    } catch {
      /* offline */
    } finally {
      setGeoBusy(false);
    }
  };

  // Sector & Azimuth helpers
  function azimuthValid(n: number) {
    return Number.isFinite(n) && n >= 0 && n < 360;
  }
  const azimuthNumbers = sectors
    .map(s => s.azimuth.trim())
    .filter(a => a !== '' && azimuthValid(Number(a)))
    .map(Number);

  const applySectorsAndSyncCells = (nextSectors: SectorConfig[]) => {
    setSectors(nextSectors);
    if (ukePermitBands.length > 0) {
      setCells(prev => buildCellsFromSectors(nextSectors, ukePermitBands, prev));
    }
  };

  const addSector = (az = '') => {
    if (sectors.length >= MAX_AZIMUTHS) return;
    const next = [...sectors, { id: newId(), azimuth: az, freqs: [...ukeUniqueFreqs] }];
    applySectorsAndSyncCells(next);
  };

  const removeSector = (idx: number) => {
    const next = sectors.filter((_, j) => j !== idx);
    applySectorsAndSyncCells(next);
  };

  const updateSectorAzimuth = (idx: number, rawVal: string) => {
    const clean = rawVal.replace(/[^\d]/g, '').slice(0, 3);
    const oldAz = sectors[idx]?.azimuth ?? '';
    const next = sectors.map((s, j) => (j === idx ? { ...s, azimuth: clean } : s));
    setSectors(next);
    // Update matching cells' azimuth
    if (oldAz !== clean) {
      setCells(prev =>
        sortCellsByBand(
          prev.map(c => (c.azimuth === oldAz ? { ...c, azimuth: clean } : c))
        )
      );
    }
  };

  const toggleSectorFreq = (idx: number, freq: number) => {
    const next = sectors.map((s, j) => {
      if (j !== idx) return s;
      const has = s.freqs.some(f => sameFreq(f, freq));
      const freqs = has ? s.freqs.filter(f => !sameFreq(f, freq)) : [...s.freqs, freq].sort((a, b) => a - b);
      return { ...s, freqs };
    });
    applySectorsAndSyncCells(next);
  };

  const loadPresetAzimuths = (angles: number[]) => {
    const next: SectorConfig[] = angles.slice(0, MAX_AZIMUTHS).map((az, i) => ({
      id: sectors[i]?.id || newId(),
      azimuth: String(az),
      freqs: sectors[i]?.freqs?.length ? sectors[i].freqs : [...ukeUniqueFreqs],
    }));
    applySectorsAndSyncCells(next);
  };

  // Photos
  const handlePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/') && f.size <= 20 * 1024 * 1024);
    setPhotos(prev => [...prev, ...files.map(f => ({ url: URL.createObjectURL(f), name: f.name }))].slice(0, MAX_PHOTOS));
    e.target.value = '';
  };

  // RAT toggle – a technology with cells cannot be switched off
  const toggleTech = (t: RatTech) => {
    if (activeTechs[t] && cells.some(c => c.tech === t)) return;
    setActiveTechs(prev => ({ ...prev, [t]: !prev[t] }));
  };

  const addCell = (t: RatTech) => {
    setCells(prev =>
      sortCellsByBand([
        ...prev,
        { id: newId(), tech: t, band: '', azimuth: '', pci: '', earfcn: '', nodeId: '', cellId: '', mode: t === '5G' ? 'NSA' : undefined, isIot: false, cellType: 'macro', notes: '' },
      ])
    );
    setActiveTechs(prev => ({ ...prev, [t]: true }));
    setTechOpen(prev => ({ ...prev, [t]: true }));
  };

  const duplicateCell = (c: CellInput) =>
    setCells(prev => {
      const idx = prev.findIndex(x => x.id === c.id);
      const copy = { ...c, id: newId(), cellId: '', pci: '' };
      return sortCellsByBand([...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)]);
    });

  const removeCell = (id: string) => setCells(prev => prev.filter(c => c.id !== id));
  const updateCell = (id: string, patch: Partial<CellInput>) =>
    setCells(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));

  const changeBand = (cell: CellInput, label: string) =>
    setCells(prev => sortCellsByBand(prev.map(c => (c.id === cell.id ? { ...c, band: label } : c))));

  // Validation
  const cellValidation = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const c of cells) {
      const errors = { ...validateCell(c, operator).errors };
      if (!String(c.band || '').trim()) errors.band = 'Pasmo: wybierz pasmo z listy.';
      if (c.tech === 'LTE' && !String(c.nodeId ?? '').trim()) errors.nodeId = 'Wymagane podanie eNBID.';
      map[c.id!] = errors;
    }
    return map;
  }, [cells, operator]);

  const headerErrors = useMemo(() => {
    const e: Record<string, string> = {};
    const check = (key: string, v: string, max: number, label: string) => {
      if (!v.trim()) return;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > max) e[key] = `${label} musi być liczbą w zakresie 1-${max}.`;
    };
    check('tac', lteTac, 65535, 'TAC');
    check('rnc', umtsRnc, 65535, 'RNC');
    check('umtsLac', umtsLac, 65535, 'LAC');
    check('gsmLac', gsmLac, 65535, 'LAC');
    return e;
  }, [lteTac, umtsRnc, umtsLac, gsmLac]);

  const stationErrors = useMemo(() => {
    const e: Record<string, string> = {};
    const a = mapCenter[0];
    const b = mapCenter[1];
    if (a < 49 || a > 55) e.lat = 'Szerokość geograficzna poza Polską (49-55).';
    if (b < 14 || b > 24.5) e.lng = 'Długość geograficzna poza Polską (14-24,5).';
    if (!city.trim()) e.city = 'Podaj miejscowość.';
    if (!stationId.trim()) e.stationId = 'Podaj identyfikator stacji.';
    if (sectors.some(s => s.azimuth.trim() !== '' && !azimuthValid(Number(s.azimuth)))) e.azimuths = 'Azymut musi mieścić się w zakresie 0-359°.';
    if (!cells.length) e.cells = 'Dodaj co najmniej jedną komórkę.';
    return e;
  }, [mapCenter, city, stationId, sectors, cells.length]);

  const errorList = useMemo(() => {
    const list: string[] = Object.values(stationErrors).concat(Object.values(headerErrors));
    RAT_ORDER.forEach(t => {
      cells
        .filter(c => c.tech === t)
        .forEach((c, i) => {
          for (const msg of Object.values(cellValidation[c.id!] || {})) list.push(`${RAT_META[t].short} #${i + 1}: ${msg}`);
        });
    });
    return list;
  }, [stationErrors, headerErrors, cells, cellValidation]);
  const totalErrors = errorList.length;

  const changesCount =
    cells.length +
    azimuthNumbers.length +
    photos.length +
    [city, address, stationId, stationName, notes, mastDescription].filter(v => v.trim()).length;

  const handleSubmit = async () => {
    if (totalErrors > 0) {
      setShowErrorList(true);
      return;
    }
    setBusy(true);
    setSubmitError('');
    try {
      await post('/submit', {
        type: 'NEW_STATION',
        data: {
          operator,
          stationId: stationId.trim(),
          name: stationName.trim() || undefined,
          backhaul,
          city: city.trim(),
          address: [city.trim(), address.trim()].filter(Boolean).join(', '),
          province,
          lat: mapCenter[0],
          lng: mapCenter[1],
          mastType,
          owner,
          mastDescription: mastDescription.trim() || undefined,
          notes: notes.trim() || undefined,
          editorNote: editorNote.trim() || undefined,
          azimuths: azimuthNumbers,
          technologies: RAT_ORDER.filter(t => activeTechs[t]),
          tac: lteTac ? Number(lteTac) : undefined,
          rnc: umtsRnc ? Number(umtsRnc) : undefined,
          cells: sortCellsByBand(cells).map(c => ({
            tech: c.tech,
            band: c.band,
            azimuth: String(c.azimuth ?? '') !== '' ? Number(c.azimuth) : undefined,
            nodeId: c.tech === 'UMTS' ? (umtsRnc ? Number(umtsRnc) : undefined) : c.nodeId ? Number(c.nodeId) : undefined,
            cellId: c.cellId ? Number(c.cellId) : undefined,
            pci: Number(c.pci),
            earfcn: Number(c.earfcn),
            isIot: Boolean(c.isIot),
            cellType: c.cellType || 'macro',
            mode: c.mode,
            tac: c.tech === 'LTE' && lteTac ? Number(lteTac) : undefined,
            lac: c.tech === 'UMTS' && umtsLac ? Number(umtsLac) : c.tech === 'GSM' && gsmLac ? Number(gsmLac) : undefined,
            notes: c.notes?.trim() || undefined,
          })),
          sourceTowerId: sourceTower?.id || null,
        },
      });
      setIsDone(true);
      onSuccess();
    } catch (e) {
      setSubmitError((e as Error).message || 'Nie udało się wysłać zgłoszenia.');
    } finally {
      setBusy(false);
    }
  };

  if (isDone) {
    return (
      <div className="ss-backdrop" role="dialog" aria-modal="true">
        <div className="ss-success">
          <CheckCircle2 size={48} className="ss-success-icon" />
          <h2>Zgłoszenie zostało wysłane</h2>
          <p>
            Stacja <strong>{stationId}</strong> ({operator}, {city}) trafiła do kolejki moderacji.
          </p>
          <button type="button" className="ss-btn" onClick={onClose}>
            <Check size={15} /> Zamknij
          </button>
        </div>
      </div>
    );
  }

  const ukeMarker: [number, number] | null = sourceTower ? [sourceTower.lat, sourceTower.lng] : null;

  // ---------- Cell table rendering ----------
  const renderBandCell = (cell: CellInput, err?: string) => {
    const bands = getAvailableBandsForOperator(operator, cell.tech);
    const alloc = cell.band ? findBandAllocation(cell.tech, cell.band) : undefined;
    const known = bands.some(b => b.label === cell.band);
    const display = !cell.band ? (
      <span className="ss-placeholder">Wybierz ...</span>
    ) : (
      <span className="ss-band-display">
        <strong>{alloc ? alloc.freqMhz : bandFreq(cell.band) || cell.band}</strong>
        <small>{alloc ? alloc.bandCode : '?'}</small>
      </span>
    );
    return (
      <SelectBox value={cell.band} onChange={v => changeBand(cell, v)} display={display} className="ss-tbl-band" invalid={Boolean(err)}>
        <option value="" disabled>
          Wybierz pasmo
        </option>
        {bands.map(b => (
          <option key={b.label} value={b.label}>
            {b.freqMhz} MHz ({b.bandCode} {b.duplex})
          </option>
        ))}
        {cell.band && !known && <option value={cell.band}>{cell.band} (spoza planu)</option>}
      </SelectBox>
    );
  };

  const renderAzimuthCell = (cell: CellInput) => (
    <SelectBox
      value={String(cell.azimuth ?? '')}
      onChange={v => updateCell(cell.id!, { azimuth: v })}
      display={String(cell.azimuth ?? '') === '' ? '-' : `${cell.azimuth}°`}
      className="ss-tbl-az"
    >
      <option value="">-</option>
      {sectors.map((s, i) =>
        s.azimuth.trim() !== '' ? (
          <option key={`${s.id}-${i}`} value={s.azimuth}>
            S{i + 1} · {s.azimuth}°
          </option>
        ) : null
      )}
    </SelectBox>
  );

  const numInput = (cell: CellInput, key: keyof CellInput, err?: string, width = 'md') => (
    <input
      type="text"
      inputMode="numeric"
      className={`ss-tbl-input w-${width} ${err ? 'is-invalid' : ''}`}
      value={String(cell[key] ?? '')}
      onChange={e => updateCell(cell.id!, { [key]: e.target.value.replace(/[^\d]/g, '') } as Partial<CellInput>)}
    />
  );

  const typeCell = (cell: CellInput) => (
    <SelectBox value={cell.cellType || 'macro'} onChange={v => updateCell(cell.id!, { cellType: v as CellInput['cellType'] })} className="ss-tbl-type">
      {CELL_TYPES.map(t => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </SelectBox>
  );

  const notesCell = (cell: CellInput) => (
    <input
      className="ss-tbl-input ss-tbl-notes"
      value={cell.notes || ''}
      onChange={e => updateCell(cell.id!, { notes: e.target.value })}
      placeholder="Dodatkowy opis komórki..."
    />
  );

  const actionsCell = (cell: CellInput) => (
    <div className="ss-row-actions">
      <button type="button" title="Duplikuj komórkę" onClick={() => duplicateCell(cell)}>
        <Copy size={14} />
      </button>
      <button type="button" title="Usuń komórkę" className="danger" onClick={() => removeCell(cell.id!)}>
        <Trash2 size={14} />
      </button>
    </div>
  );

  const columnsFor = (t: RatTech) => {
    if (t === '5G') return ['Pasmo', 'Azymut', 'Tryb', 'PCI', 'ARFCN', 'Rodzaj', 'Uwagi', ''];
    if (t === 'LTE') return ['Pasmo', 'Azymut', 'eNBID', 'CLID', 'ECI', 'PCI', 'EARFCN', 'IoT', 'Rodzaj', 'Uwagi', ''];
    if (t === 'UMTS') return ['Pasmo', 'Azymut', 'CID', 'LongCID', 'PSC', 'UARFCN', 'Rodzaj', 'Uwagi', ''];
    return ['Pasmo', 'Azymut', 'CID', 'BSIC', 'ARFCN', 'Rodzaj', 'Uwagi', ''];
  };

  const renderRow = (cell: CellInput, t: RatTech) => {
    const err = cellValidation[cell.id!] || {};
    const cols = columnsFor(t).length;
    const eci = t === 'LTE' ? calculateEci(cell.nodeId ?? '', cell.cellId ?? '', 'LTE') : null;
    const longCid = t === 'UMTS' && umtsRnc && cell.cellId ? Number(umtsRnc) * 65536 + Number(cell.cellId) : null;
    const errEntries = Object.entries(err);
    return (
      <React.Fragment key={cell.id}>
        <tr className={`ss-row ${errEntries.length ? 'has-error' : ''}`}>
          <td>{renderBandCell(cell, err.band)}</td>
          <td>{renderAzimuthCell(cell)}</td>
          {t === '5G' && (
            <>
              <td>
                <SelectBox value={cell.mode || 'NSA'} onChange={v => updateCell(cell.id!, { mode: v as 'NSA' | 'SA' })} className="ss-tbl-mode">
                  <option value="NSA">NSA</option>
                  <option value="SA">SA</option>
                </SelectBox>
              </td>
              <td>{numInput(cell, 'pci', err.pci, 'sm')}</td>
              <td>{numInput(cell, 'earfcn', err.earfcn, 'lg')}</td>
            </>
          )}
          {t === 'LTE' && (
            <>
              <td>{numInput(cell, 'nodeId', err.nodeId, 'lg')}</td>
              <td>{numInput(cell, 'cellId', err.cellId, 'sm')}</td>
              <td className="ss-computed">{eci ?? '-'}</td>
              <td>{numInput(cell, 'pci', err.pci, 'sm')}</td>
              <td>{numInput(cell, 'earfcn', err.earfcn, 'md')}</td>
              <td className="ss-center">
                <input type="checkbox" className="ss-check" checked={Boolean(cell.isIot)} onChange={e => updateCell(cell.id!, { isIot: e.target.checked })} />
              </td>
            </>
          )}
          {t === 'UMTS' && (
            <>
              <td>{numInput(cell, 'cellId', err.cellId, 'md')}</td>
              <td className="ss-computed">{longCid ?? '-'}</td>
              <td>{numInput(cell, 'pci', err.pci, 'sm')}</td>
              <td>{numInput(cell, 'earfcn', err.earfcn, 'md')}</td>
            </>
          )}
          {t === 'GSM' && (
            <>
              <td>{numInput(cell, 'cellId', err.cellId, 'md')}</td>
              <td>{numInput(cell, 'pci', err.pci, 'sm')}</td>
              <td>{numInput(cell, 'earfcn', err.earfcn, 'md')}</td>
            </>
          )}
          <td>{typeCell(cell)}</td>
          <td className="ss-grow">{notesCell(cell)}</td>
          <td>{actionsCell(cell)}</td>
        </tr>
        {errEntries.length > 0 && (
          <tr className="ss-row-errors">
            <td colSpan={cols}>
              {errEntries.map(([field, msg]) => (
                <span key={field}>
                  <AlertCircle size={12} />
                  {msg.startsWith(FIELD_LABELS[field] || '§') ? msg : `${FIELD_LABELS[field] || field}: ${msg}`}
                </span>
              ))}
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  const ratMenu = (t: RatTech) => {
    const ratCells = cells.filter(c => c.tech === t);
    const firstNode = ratCells.find(c => String(c.nodeId ?? '').trim())?.nodeId;
    const items: { label: string; action: () => void; disabled?: boolean }[] = [
      {
        label: 'Sortuj pasma rosnąco (MHz)',
        action: () => setCells(prev => sortCellsByBand(prev)),
      },
      ...(t === 'LTE'
        ? [
            {
              label: 'Powiel eNBID z pierwszej komórki',
              disabled: !firstNode,
              action: () => setCells(prev => prev.map(c => (c.tech === 'LTE' ? { ...c, nodeId: firstNode } : c))),
            },
          ]
        : []),
      {
        label: 'Przypisz azymuty z sektorów',
        disabled: azimuthNumbers.length === 0,
        action: () => {
          let i = 0;
          setCells(prev => prev.map(c => (c.tech === t ? { ...c, azimuth: String(azimuthNumbers[i++ % azimuthNumbers.length]) } : c)));
        },
      },
      {
        label: 'Wyczyść komórki tej technologii',
        action: () => setCells(prev => prev.filter(c => c.tech !== t)),
        disabled: ratCells.length === 0,
      },
    ];
    return (
      <div className="ss-menu" onClick={e => e.stopPropagation()}>
        {items.map(it => (
          <button
            key={it.label}
            type="button"
            disabled={it.disabled}
            onClick={() => {
              it.action();
              setOpenMenu(null);
            }}
          >
            {it.label}
          </button>
        ))}
      </div>
    );
  };

  const opColor = operatorColor(operator);

  return (
    <div className="ss-backdrop" role="dialog" aria-modal="true" aria-label="Formularz zgłoszenia stacji">
      <div className="ss-page">
        {/* Top bar */}
        <header className="ss-topbar">
          <nav className="ss-crumbs" aria-label="Ścieżka">
            <span>Baza BTMap</span>
            <ChevronRight size={13} />
            <strong>{sourceTower?.stationId ? `Zgłoszenie stacji: ${sourceTower.stationId}` : 'Nowe zgłoszenie stacji'}</strong>
          </nav>
          <div className="ss-topbar-right">
            {totalErrors > 0 ? (
              <button
                type="button"
                className="ss-err-pill"
                onClick={e => {
                  e.stopPropagation();
                  setShowErrorList(v => !v);
                }}
              >
                <AlertCircle size={13} />
                {totalErrors} {plural(totalErrors, 'do uzupełnienia', 'do uzupełnienia', 'do uzupełnienia')}
                <ChevronDown size={13} />
              </button>
            ) : (
              <span className="ss-ok-pill">
                <CheckCircle2 size={13} /> Dane kompletne
              </span>
            )}
            <button type="button" className="ss-icon-btn" onClick={onClose} aria-label="Zamknij">
              <X size={18} />
            </button>
            {showErrorList && totalErrors > 0 && (
              <div className="ss-err-list" onClick={e => e.stopPropagation()}>
                {errorList.map((m, i) => (
                  <div key={i}>
                    <AlertCircle size={12} /> {m}
                  </div>
                ))}
              </div>
            )}
          </div>
        </header>

        {submitError && (
          <div className="ss-submit-error">
            <AlertCircle size={15} /> {submitError}
          </div>
        )}

        <div className="ss-body">
          {/* ================= LEFT ================= */}
          <aside className="ss-left">
            <div className="ss-left-scroll">
              {/* Tryb zgłoszenia */}
              <section className="ss-card">
                <div className="ss-card-head">
                  <span className="ss-card-title">
                    <RadioTower size={15} /> Tryb zgłoszenia
                  </span>
                  <div className="ss-seg">
                    <button type="button" className={stationMode === 'new' ? 'active' : ''} onClick={() => setStationMode('new')}>
                      <Plus size={13} /> Nowa stacja
                    </button>
                    <button type="button" className={stationMode === 'existing' ? 'active' : ''} onClick={() => setStationMode('existing')}>
                      <FilePen size={13} /> Aktualizacja
                    </button>
                  </div>
                </div>
                <div className="ss-card-body">
                  <p className="ss-muted">
                    {stationMode === 'new'
                      ? 'Wskaż punkt na mapie satelitarnej i uzupełnij parametry radiowe odebrane w terenie.'
                      : 'Zaproponuj korektę parametrów lub uzupełnienie komórek dla wybranej lokalizacji.'}
                  </p>
                </div>
              </section>

              {/* Wybór operatora sieci */}
              <section className="ss-card ss-card-operator" style={{ '--current-op-color': opColor } as React.CSSProperties}>
                <div className="ss-card-head">
                  <span className="ss-card-title">
                    <Signal size={15} style={{ color: opColor }} /> Operator stacji bazowej
                  </span>
                  <span className="ss-op-selected-tag" style={{ borderColor: opColor, color: opColor }}>
                    <i className="ss-op-dot" style={{ background: opColor }} />
                    {operator}
                  </span>
                </div>
                <div className="ss-card-body">
                  <div className="ss-operator-selector" role="radiogroup" aria-label="Wybierz operatora sieci">
                    {OPERATORS.slice(0, 4).map(o => {
                      const isSelected = operator === o.name;
                      return (
                        <button
                          key={o.name}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          className={`ss-operator-btn ${isSelected ? 'is-selected' : ''}`}
                          style={{ '--op-accent': o.color } as React.CSSProperties}
                          onClick={() => setOperator(o.name)}
                        >
                          <i className="ss-op-indicator" style={{ background: o.color }} />
                          <span className="ss-op-name">{o.name}</span>
                          {isSelected && (
                            <span className="ss-op-check" aria-hidden="true">
                              <Check size={12} strokeWidth={3} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="ss-help">
                    Wybór operatora filtruje dostępne pasma radiowe (np. wyłączność pasma 2600 TDD dla Plus) oraz reguły walidacji kanałów i numeracji stacji.
                  </p>
                </div>
              </section>

              {/* Lokalizacja */}
              <section className="ss-card">
                <div className="ss-card-head">
                  <span className="ss-card-title">
                    <MapPin size={15} /> Położenie i obiekt
                  </span>
                  <label className="ss-check-label">
                    <input type="checkbox" className="ss-check" checked={showUkeLocations} onChange={e => setShowUkeLocations(e.target.checked)} />
                    Punkt z wykazu UKE
                  </label>
                </div>
                <div className="ss-map">
                  <MapContainer center={mapCenter} zoom={16} zoomControl={false} attributionControl={false} className="ss-map-inner">
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
                    {showUkeLocations && ukeMarker && (
                      <CircleMarker center={ukeMarker} radius={6} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#0b0d10', fillOpacity: 1 }} />
                    )}
                    <CircleMarker center={mapCenter} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#0ea5e9', fillOpacity: 1 }} />
                    <MapController center={mapCenter} onPick={pickLocation} />
                    <MapButtons center={ukeMarker} />
                  </MapContainer>
                  <div className="ss-map-attr">BTMap · zobrazowanie Esri World Imagery</div>
                </div>
                <div className="ss-card-body">
                  <button type="button" className="ss-btn ss-btn-sm" onClick={autoAddress} disabled={geoBusy}>
                    <MapPin size={13} /> {geoBusy ? 'Pobieranie danych adresowych…' : 'Pobierz adres ze współrzędnych'}
                  </button>

                  <div className="ss-grid-2">
                    <label className="ss-field">
                      <span>Szerokość geogr. (N)</span>
                      <input
                        type="number"
                        step="0.000001"
                        className={`ss-input ss-mono ${stationErrors.lat ? 'is-invalid' : ''}`}
                        value={lat}
                        onChange={e => setLat(e.target.value)}
                      />
                    </label>
                    <label className="ss-field">
                      <span>Długość geogr. (E)</span>
                      <input
                        type="number"
                        step="0.000001"
                        className={`ss-input ss-mono ${stationErrors.lng ? 'is-invalid' : ''}`}
                        value={lng}
                        onChange={e => setLng(e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="ss-field">
                    <span>Województwo</span>
                    <div className="ss-inline">
                      <SelectBox value={province} onChange={setProvince} className="ss-fit">
                        {PROVINCES.map(p => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </SelectBox>
                      <span className="ss-hint-inline">
                        <Compass size={12} /> wykryto z GPS
                      </span>
                    </div>
                  </div>

                  <div className="ss-grid-2">
                    <label className="ss-field">
                      <span>Miejscowość</span>
                      <input
                        className={`ss-input ${stationErrors.city ? 'is-invalid' : ''}`}
                        value={city}
                        onChange={e => setCity(e.target.value)}
                        placeholder="np. Poznań"
                      />
                    </label>
                    <label className="ss-field">
                      <span>Ulica / lokalizacja</span>
                      <input
                        className="ss-input"
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                        placeholder="np. ul. Kolejowa 12"
                      />
                    </label>
                  </div>

                  <hr className="ss-divider" />

                  <div className="ss-grid-2">
                    <div className="ss-field">
                      <span>Konstrukcja</span>
                      <SelectBox
                        value={mastType}
                        onChange={setMastType}
                        display={<span className={mastType === 'Nieznany' ? 'ss-placeholder' : ''}>{mastType}</span>}
                      >
                        {MAST_TYPES.map(m => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </SelectBox>
                    </div>
                    <div className="ss-field">
                      <span>Właściciel konstrukcji</span>
                      <SelectBox
                        value={owner}
                        onChange={setOwner}
                        chevron="down"
                        icon={<Building size={14} />}
                        display={<span className={owner === 'Nieznany' ? 'ss-placeholder' : ''}>{owner}</span>}
                      >
                        {OWNERS.map(o => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </SelectBox>
                    </div>
                  </div>

                  <label className="ss-field">
                    <span className="ss-field-row">
                      Dodatkowy opis konstrukcji <em>{mastDescription.length} / 150</em>
                    </span>
                    <input
                      className="ss-input"
                      maxLength={150}
                      value={mastDescription}
                      onChange={e => setMastDescription(e.target.value)}
                      placeholder="np. wieża rurowa / konstrukcja na dachu"
                    />
                  </label>
                </div>
              </section>

              {/* Dane operatora i stacji */}
              <section className="ss-card">
                <div className="ss-card-head">
                  <span className="ss-card-title">
                    <Building2 size={15} /> Dane stacji bazowej
                  </span>
                </div>
                <div className="ss-card-body">
                  <div className="ss-inline ss-gap-12">
                    <div className="ss-field">
                      <span>Sieć macierzysta</span>
                      <SelectBox
                        value={operator}
                        onChange={setOperator}
                        className="ss-fit"
                        icon={<i className="ss-op-dot" style={{ background: opColor }} />}
                      >
                        {OPERATORS.map(o => (
                          <option key={o.name} value={o.name}>
                            {o.name}
                          </option>
                        ))}
                      </SelectBox>
                    </div>
                    <div className="ss-field">
                      <span>Dosył (Backhaul)</span>
                      <SelectBox value={backhaul} onChange={setBackhaul} className="ss-w-140">
                        {BACKHAUL_OPTIONS.map(b => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </SelectBox>
                    </div>
                  </div>

                  <div className="ss-grid-id">
                    <label className="ss-field">
                      <span>ID stacji</span>
                      <input
                        className={`ss-input ss-mono ${stationErrors.stationId ? 'is-invalid' : ''}`}
                        value={stationId}
                        onChange={e => setStationId(e.target.value.toUpperCase())}
                        placeholder="np. WAWA001"
                      />
                    </label>
                    <label className="ss-field">
                      <span>Nazwa własna ({operator})</span>
                      <input
                        className="ss-input"
                        value={stationName}
                        onChange={e => setStationName(e.target.value)}
                        placeholder="Opcjonalna nazwa obiektu"
                      />
                    </label>
                  </div>
                  <p className="ss-help">Oznaczenie stacji z pozwolenia radiowego lub programu pomiarowego</p>

                  <label className="ss-field">
                    <span>Informacje ogólne o stacji</span>
                    <textarea
                      className="ss-input ss-textarea"
                      rows={3}
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Uwagi dotyczące współdzielenia anten, modernizacji itp..."
                    />
                  </label>
                </div>
              </section>

              {/* Sektory, azymuty i pasma na sektorach */}
              <section className="ss-card">
                <div className="ss-card-head ss-clickable" onClick={() => setAzimuthsOpen(v => !v)}>
                  <span className="ss-card-title">
                    <ChevronDown size={14} className={`ss-chev ${azimuthsOpen ? '' : 'closed'}`} /> Sektory i azymuty
                  </span>
                  <div className="ss-head-right" onClick={e => e.stopPropagation()}>
                    <div className="ss-menu-wrap">
                      <button
                        type="button"
                        className="ss-btn ss-btn-sm"
                        onClick={e => {
                          e.stopPropagation();
                          setOpenMenu(openMenu === 'az' ? null : 'az');
                        }}
                      >
                        Układ sektorów <ChevronDown size={13} />
                      </button>
                      {openMenu === 'az' && (
                        <div className="ss-menu" onClick={e => e.stopPropagation()}>
                          {pemAntennas.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const pemSec = sectorsFromPemAntennas(pemAntennas, ukeUniqueFreqs);
                                if (pemSec.length) applySectorsAndSyncCells(pemSec);
                                setOpenMenu(null);
                              }}
                            >
                              Wczytaj sektory i pasma z raportu SI2PEM
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              loadPresetAzimuths([0, 120, 240]);
                              setOpenMenu(null);
                            }}
                          >
                            3 sektory (0°, 120°, 240°)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              loadPresetAzimuths([0, 90, 180, 270]);
                              setOpenMenu(null);
                            }}
                          >
                            4 sektory (0°, 90°, 180°, 270°)
                          </button>
                          <button
                            type="button"
                            disabled={!sectors.length}
                            onClick={() => {
                              setSectors([]);
                              setOpenMenu(null);
                            }}
                          >
                            Wyczyść sektory
                          </button>
                        </div>
                      )}
                    </div>
                    <span className="ss-counter">
                      {sectors.length}/{MAX_AZIMUTHS}
                    </span>
                  </div>
                </div>
                {azimuthsOpen && (
                  <div className="ss-card-body">
                    <div className="ss-note-box">
                      {pemStatus === 'loading' ? (
                        <span className="ss-inline">
                          <RefreshCw size={12} className="ss-spin" /> Sprawdzanie układu sektorów i pasm w raporcie SI2PEM…
                        </span>
                      ) : pemStatus === 'loaded' ? (
                        <span>
                          Wczytano z raportu SI2PEM: <strong>{sectors.length}</strong> {plural(sectors.length, 'sektor', 'sektory', 'sektorów')} wraz z przypisanymi pasmami.
                        </span>
                      ) : (
                        <span>
                          Kliknij pasma przy danym sektorze, aby określić, które częstotliwości działają na tym kierunku (np. LTE 1800 tylko na 3 z 4 sektorów).
                        </span>
                      )}
                    </div>

                    {sectors.length === 0 ? (
                      <div className="ss-empty-dashed">Brak zdefiniowanych sektorów</div>
                    ) : (
                      <div className="ss-az-list">
                        {sectors.map((sec, i) => {
                          const bad = sec.azimuth.trim() !== '' && !azimuthValid(Number(sec.azimuth));
                          return (
                            <div key={sec.id} className="ss-sector-box">
                              <div className="ss-az-row">
                                <span className="ss-az-tag">S{i + 1}</span>
                                <div className={`ss-az-input ${bad ? 'is-invalid' : ''}`}>
                                  <input
                                    inputMode="numeric"
                                    value={sec.azimuth}
                                    onChange={e => updateSectorAzimuth(i, e.target.value)}
                                    placeholder="Azymut 0-359"
                                  />
                                  <span>°</span>
                                </div>
                                <button
                                  type="button"
                                  className="ss-icon-btn danger"
                                  title="Usuń sektor"
                                  onClick={() => removeSector(i)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                              {ukeUniqueFreqs.length > 0 && (
                                <div className="ss-sector-bands" title="Pasma aktywne na tym sektorze">
                                  {ukeUniqueFreqs.map(freq => {
                                    const isOn = sec.freqs.some(f => sameFreq(f, freq));
                                    return (
                                      <button
                                        key={freq}
                                        type="button"
                                        className={`ss-freq-chip ${isOn ? 'on' : ''}`}
                                        onClick={() => toggleSectorFreq(i, freq)}
                                      >
                                        {freq}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {stationErrors.azimuths && (
                          <p className="ss-field-error">
                            <AlertCircle size={12} /> {stationErrors.azimuths}
                          </p>
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      className="ss-btn ss-btn-add"
                      disabled={sectors.length >= MAX_AZIMUTHS}
                      onClick={() => addSector()}
                    >
                      <Plus size={15} /> Dodaj sektor <span className="ss-dim">{sectors.length}/{MAX_AZIMUTHS}</span>
                    </button>
                  </div>
                )}
              </section>

              {/* Zdjęcia */}
              <section className="ss-card">
                <div className="ss-card-head ss-clickable" onClick={() => setPhotosOpen(v => !v)}>
                  <span className="ss-card-title">
                    <ChevronDown size={14} className={`ss-chev ${photosOpen ? '' : 'closed'}`} /> <ImageIcon size={15} /> Dokumentacja zdjęciowa
                  </span>
                </div>
                {photosOpen && (
                  <div className="ss-card-body">
                    <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handlePhotos} />
                    <div className="ss-photos">
                      <div className="ss-photos-head">
                        Załączniki <span className="ss-dim">{photos.length}/{MAX_PHOTOS}</span>
                      </div>
                      {photos.length === 0 ? (
                        <div className="ss-photos-empty">
                          <ImageIcon size={26} />
                          <p>Brak załączonych zdjęć wieży lub anten</p>
                          <button type="button" className="ss-btn ss-btn-sm" onClick={() => fileInputRef.current?.click()}>
                            <Upload size={13} /> Wybierz plik z dysku
                          </button>
                        </div>
                      ) : (
                        <div className="ss-photos-grid">
                          {photos.map((p, i) => (
                            <figure key={p.url}>
                              <img src={p.url} alt={p.name} />
                              <button type="button" title="Usuń zdjęcie" onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}>
                                <X size={12} />
                              </button>
                            </figure>
                          ))}
                          {photos.length < MAX_PHOTOS && (
                            <button type="button" className="ss-photo-add" onClick={() => fileInputRef.current?.click()}>
                              <Plus size={16} /> Dodaj
                            </button>
                          )}
                        </div>
                      )}
                      <div className="ss-photos-foot">Maksymalnie 10 plików graficznych (do 20 MB na plik)</div>
                    </div>
                  </div>
                )}
              </section>

              {/* Technologie radiowe */}
              <section className="ss-plain">
                <h3 className="ss-plain-title">
                  <Signal size={15} /> Aktywne systemy radiowe
                </h3>
                <p className="ss-muted">
                  Włącz standardy obecne na stacji. Aby wyłączyć system posiadający wpisane komórki, najpierw wyczyść jego tabelę po prawej stronie.
                </p>
                <div className="ss-rat-pills">
                  {RAT_ORDER.map(t => {
                    const locked = activeTechs[t] && cells.some(c => c.tech === t);
                    return (
                      <button
                        key={t}
                        type="button"
                        className={`ss-rat-pill ${activeTechs[t] ? 'on' : ''} ${locked ? 'locked' : ''}`}
                        onClick={() => toggleTech(t)}
                        title={locked ? 'Usuń komórki tej technologii w tabeli, aby ją wyłączyć' : undefined}
                      >
                        <span className="ss-gen">{RAT_META[t].gen}</span>
                        {RAT_META[t].short}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* Sticky footer */}
            <footer className="ss-left-foot">
              <div className="ss-field-row ss-foot-row">
                <strong>Komentarz do zgłoszenia</strong>
                <em>
                  {cells.length} {plural(cells.length, 'komórka', 'komórki', 'komórek')} · {changesCount} {plural(changesCount, 'wpis', 'wpisy', 'wpisów')}
                </em>
              </div>
              <textarea
                className="ss-input ss-textarea"
                rows={2}
                value={editorNote}
                onChange={e => setEditorNote(e.target.value)}
                placeholder="Źródło danych (np. odczyt z NetMonster, obserwacja w terenie)..."
              />
              <button type="button" className="ss-submit" onClick={handleSubmit} disabled={busy}>
                {busy ? 'Przesyłanie zgłoszenia…' : 'Prześlij do moderacji'} <Send size={14} />
              </button>
            </footer>
          </aside>

          {/* ================= RIGHT: KOMÓRKI ================= */}
          <main className="ss-right">
            <div className="ss-right-head">
              <span className="ss-section-label">KONFIGURACJA KOMÓREK (OD NAJNIŻSZEGO PASMA)</span>
              <span className="ss-rule" />
              <div className="ss-menu-wrap">
                <button
                  type="button"
                  className="ss-link-btn"
                  onClick={e => {
                    e.stopPropagation();
                    setShowShortcuts(v => !v);
                  }}
                >
                  <Keyboard size={13} /> Klawisze
                </button>
                {showShortcuts && (
                  <div className="ss-menu ss-shortcuts" onClick={e => e.stopPropagation()}>
                    <div>
                      <kbd>Tab</kbd> przejście do kolejnej kolumny
                    </div>
                    <div>
                      <kbd>Shift</kbd>+<kbd>Tab</kbd> poprzednia kolumna
                    </div>
                    <div>
                      <kbd>↑</kbd>
                      <kbd>↓</kbd> wybór pasma z listy
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="ss-right-scroll">
              {RAT_ORDER.filter(t => activeTechs[t]).length === 0 && (
                <div className="ss-empty-dashed ss-empty-big">Aktywuj system radiowy w panelu po lewej stronie, aby skonfigurować komórki.</div>
              )}
              {RAT_ORDER.filter(t => activeTechs[t]).map(t => {
                const ratCells = sortCellsByBand(cells.filter(c => c.tech === t));
                const open = techOpen[t];
                const cols = columnsFor(t);
                return (
                  <section key={t} className="ss-rat">
                    <div className="ss-rat-head" onClick={() => setTechOpen(prev => ({ ...prev, [t]: !prev[t] }))}>
                      <div className="ss-rat-title">
                        <ChevronDown size={14} className={`ss-chev ${open ? '' : 'closed'}`} />
                        <span className="ss-gen-badge">{RAT_META[t].gen}</span>
                        <strong>{RAT_META[t].short}</strong>
                        <span className="ss-dim">
                          ({ratCells.length} {plural(ratCells.length, 'komórka', 'komórki', 'komórek')})
                        </span>
                        {ratCells.length > 0 && (
                          <span className="ss-new">
                            <i /> {ratCells.length} w zestawieniu
                          </span>
                        )}
                      </div>
                      <div className="ss-rat-actions" onClick={e => e.stopPropagation()}>
                        {t === 'LTE' && (
                          <label className="ss-hdr-field">
                            TAC{' '}
                            <input
                              className={headerErrors.tac ? 'is-invalid' : ''}
                              inputMode="numeric"
                              value={lteTac}
                              onChange={e => setLteTac(e.target.value.replace(/\D/g, ''))}
                            />
                          </label>
                        )}
                        {t === 'UMTS' && (
                          <>
                            <label className="ss-hdr-field">
                              RNC{' '}
                              <input
                                className={headerErrors.rnc ? 'is-invalid' : ''}
                                inputMode="numeric"
                                value={umtsRnc}
                                onChange={e => setUmtsRnc(e.target.value.replace(/\D/g, ''))}
                              />
                            </label>
                            <label className="ss-hdr-field">
                              LAC{' '}
                              <input
                                className={headerErrors.umtsLac ? 'is-invalid' : ''}
                                inputMode="numeric"
                                value={umtsLac}
                                onChange={e => setUmtsLac(e.target.value.replace(/\D/g, ''))}
                              />
                            </label>
                          </>
                        )}
                        {t === 'GSM' && (
                          <label className="ss-hdr-field">
                            LAC{' '}
                            <input
                              className={headerErrors.gsmLac ? 'is-invalid' : ''}
                              inputMode="numeric"
                              value={gsmLac}
                              onChange={e => setGsmLac(e.target.value.replace(/\D/g, ''))}
                            />
                          </label>
                        )}
                        <div className="ss-menu-wrap">
                          <button
                            type="button"
                            className="ss-link-btn"
                            onClick={e => {
                              e.stopPropagation();
                              setOpenMenu(openMenu === t ? null : t);
                            }}
                          >
                            <Wand2 size={13} /> Operacje <ChevronDown size={12} />
                          </button>
                          {openMenu === t && ratMenu(t)}
                        </div>
                        <button type="button" className="ss-link-btn ss-strong" onClick={() => addCell(t)}>
                          <Plus size={14} /> Dodaj komórkę
                        </button>
                      </div>
                    </div>
                    {open && (
                      <div className="ss-table-wrap">
                        <table className="ss-table">
                          <thead>
                            <tr>
                              {cols.map((c, i) => (
                                <th key={i} className={c === 'Uwagi' ? 'ss-grow' : ''}>
                                  {c === 'ECI' ? (
                                    <>
                                      ECI <i className="ss-fn">ƒ</i>
                                    </>
                                  ) : c === 'LongCID' ? (
                                    <>
                                      LongCID <i className="ss-fn">ƒ</i>
                                    </>
                                  ) : (
                                    c
                                  )}
                                  {c === 'Rodzaj' && (
                                    <span
                                      className="ss-info"
                                      title="macro – stacja makro, micro – mała komórka zewnętrzna, indoor – instalacja wewnętrzna"
                                    >
                                      <Info size={12} />
                                    </span>
                                  )}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {ratCells.length === 0 ? (
                              <tr>
                                <td colSpan={cols.length} className="ss-table-empty">
                                  Brak komórek – kliknij „Dodaj komórkę” lub zaznacz pasmo na sektorze.
                                </td>
                              </tr>
                            ) : (
                              ratCells.map(c => renderRow(c, t))
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function MapButtons({ center }: { center: [number, number] | null }) {
  const map = useMap();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current);
      L.DomEvent.disableScrollPropagation(ref.current);
    }
  }, []);
  return (
    <div className="ss-map-btns" ref={ref}>
      <button type="button" aria-label="Przybliż" onClick={() => map.zoomIn()}>
        <Plus size={15} />
      </button>
      <button type="button" aria-label="Oddal" onClick={() => map.zoomOut()}>
        <span className="ss-minus" />
      </button>
      <button
        type="button"
        aria-label="Wyśrodkuj na lokalizacji UKE"
        className="ss-map-locate"
        disabled={!center}
        onClick={() => {
          if (center) map.setView(center, 17);
        }}
      >
        <Locate size={15} />
      </button>
    </div>
  );
}
