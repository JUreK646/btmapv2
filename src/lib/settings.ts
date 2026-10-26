export type MarkerShape = 'dots' | 'pins' | 'badges';
export type MarkerSize = 'compact' | 'normal' | 'large';
export type StationLabelsMode = 'none' | 'id' | 'full';
export type CoordFormat = 'DD' | 'DMS';
export type AzimuthOpacity = 0.2 | 0.45 | 0.75;
export type AzimuthLength = 'short' | 'normal' | 'long';

export interface AppSettings {
  markerShape: MarkerShape;
  markerSize: MarkerSize;
  showStationLabels: StationLabelsMode;
  highContrastMarkers: boolean;
  azimuthOpacity: AzimuthOpacity;
  azimuthLength: AzimuthLength;
  coordFormat: CoordFormat;
  smoothFlyTo: boolean;
  rememberMapLocation: boolean;
  autoShowAzimuthsOnSelect: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  markerShape: 'dots',
  markerSize: 'normal',
  showStationLabels: 'none',
  highContrastMarkers: false,
  azimuthOpacity: 0.45,
  azimuthLength: 'normal',
  coordFormat: 'DD',
  smoothFlyTo: true,
  rememberMapLocation: true,
  autoShowAzimuthsOnSelect: true,
};

export const SETTINGS_STORAGE_KEY = 'btmap.settings';

export function readSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

function toDms(deg: number, isLat: boolean): string {
  const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = Math.round((abs - d - m / 60) * 3600);
  return `${d}°${m.toString().padStart(2, '0')}'${s.toString().padStart(2, '0')}" ${dir}`;
}

export function formatCoordinates(lat: number, lng: number, format: CoordFormat = 'DD'): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '—';
  if (format === 'DD') {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
  return `${toDms(lat, true)}, ${toDms(lng, false)}`;
}
