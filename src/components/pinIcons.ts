import L from 'leaflet';
import type { Tower } from '../types';
import { operatorColor } from '../lib/constants';
import type { MarkerSize, StationLabelsMode } from '../lib/settings';

const iconCache = new Map<string, L.DivIcon>();

interface PinOptions {
  isSelected: boolean;
  size: MarkerSize;
  labelsMode: StationLabelsMode;
  highContrast: boolean;
}

const OP_GRADIENTS: Record<string, [string, string]> = {
  Orange: ['#ff7900', '#d9480f'],
  Play: ['#8b5cf6', '#6d28d9'],
  Plus: ['#00a651', '#047857'],
  'T-Mobile': ['#e20074', '#9d174d'],
  default: ['#0284c7', '#0369a1'],
};

export function getBtsPinIcon(tower: Tower, options: PinOptions): L.DivIcon {
  const { isSelected, size, labelsMode, highContrast } = options;
  const opName = tower.operators[0]?.name || 'default';
  const isBtmap = tower.source === 'BTMAP';
  const stationId = tower.stationId || tower.id.slice(0, 10);

  const labelText =
    labelsMode === 'none'
      ? ''
      : labelsMode === 'full'
      ? `${stationId} · ${opName}`
      : stationId;

  const cacheKey = `${opName}-${isBtmap}-${isSelected}-${size}-${highContrast}-${labelText}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const [col1, col2] = OP_GRADIENTS[opName] || [operatorColor(opName) || '#3b82f6', '#1d4ed8'];

  let w = size === 'compact' ? 22 : size === 'large' ? 34 : 28;
  let h = size === 'compact' ? 29 : size === 'large' ? 44 : 36;
  if (isSelected) {
    w = Math.round(w * 1.2);
    h = Math.round(h * 1.2);
  }

  const strokeColor = highContrast ? '#ffffff' : isBtmap ? '#00e5ff' : 'rgba(255, 255, 255, 0.7)';
  const strokeWidth = isSelected ? '2.5' : isBtmap || highContrast ? '2' : '1.2';
  const shadowFilter = isSelected
    ? 'drop-shadow(0 0 8px #00e5ff) drop-shadow(0 4px 6px rgba(0,0,0,0.6))'
    : 'drop-shadow(0 3px 5px rgba(0,0,0,0.45))';

  const svg = `<svg width="${w}" height="${h}" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:${shadowFilter};">
    <defs>
      <linearGradient id="g-${cacheKey.replace(/[^a-zA-Z0-9]/g, '_')}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${col1}" />
        <stop offset="100%" stop-color="${col2}" />
      </linearGradient>
    </defs>
    <path d="M14 0.8C6.7 0.8 0.8 6.7 0.8 14c0 9.8 12.1 20.7 12.6 21.2a0.9 0.9 0 0 0 1.2 0c0.5-0.5 12.6-11.4 12.6-21.2 0-7.3-5.9-13.2-13.2-13.2z" fill="url(#g-${cacheKey.replace(/[^a-zA-Z0-9]/g, '_')})" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>
    <circle cx="14" cy="13.5" r="7" fill="#ffffff" fill-opacity="0.95"/>
    <path d="M11 10.5a3 3 0 0 0 0 6M17 10.5a3 3 0 0 1 0 6M9 8.5a6 6 0 0 0 0 10M19 8.5a6 6 0 0 1 0 10" stroke="${col1}" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <circle cx="14" cy="13.5" r="1.8" fill="${col1}"/>
  </svg>`;

  const html = `<div class="bts-pin-container ${isSelected ? 'selected' : ''}">
    ${svg}
    ${labelText ? `<span class="bts-pin-label">${labelText}</span>` : ''}
  </div>`;

  const icon = L.divIcon({
    className: 'bts-pin-leaflet-icon',
    html,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
  });

  iconCache.set(cacheKey, icon);
  return icon;
}

export function getBtsBadgeIcon(tower: Tower, options: PinOptions): L.DivIcon {
  const { isSelected, size, labelsMode, highContrast } = options;
  const opName = tower.operators[0]?.name || 'UKE';
  const opColor = operatorColor(opName) || '#3b82f6';
  const stationId = tower.stationId || tower.id.slice(0, 8);
  const isBtmap = tower.source === 'BTMAP';

  const cacheKey = `badge-${opName}-${isBtmap}-${isSelected}-${size}-${highContrast}-${stationId}-${labelsMode}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const showId = labelsMode !== 'none';
  const scale = size === 'compact' ? '0.85' : size === 'large' ? '1.15' : '1.0';

  const html = `<div class="bts-badge-container ${isSelected ? 'selected' : ''} ${isBtmap ? 'is-btmap' : ''}" style="transform: translate(-50%, -50%) scale(${scale}); ${highContrast ? 'border-color: #fff; font-weight: 800;' : ''}">
    <span class="bts-badge-dot" style="background:${opColor};"></span>
    <span class="bts-badge-name">${opName}</span>
    ${showId ? `<span class="bts-badge-sub">· ${stationId}</span>` : ''}
  </div>`;

  const icon = L.divIcon({
    className: 'bts-badge-leaflet-icon',
    html,
    iconSize: [80, 24],
    iconAnchor: [40, 12],
  });

  iconCache.set(cacheKey, icon);
  return icon;
}
