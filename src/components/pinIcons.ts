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

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function labelFor(tower: Tower, opName: string, mode: StationLabelsMode): string {
  if (mode === 'none') return '';
  const stationId = tower.stationId || tower.id.slice(0, 10);
  return mode === 'full' ? `${stationId} · ${opName}` : stationId;
}

/**
 * Classic, slim solid teardrop pin (no inner hole/icon) in the operator colour
 * with a clean dark outline, matching classic BTS map pins.
 * The icon anchor sits at the bottom tip of the pin.
 */
export function getBtsPinIcon(tower: Tower, options: PinOptions): L.DivIcon {
  const { isSelected, size, labelsMode, highContrast } = options;
  const opName = tower.operators[0]?.name || 'UKE';
  const isBtmap = tower.source === 'BTMAP';
  const labelText = labelFor(tower, opName, labelsMode);

  const cacheKey = `pin-v3-${opName}-${isBtmap}-${isSelected}-${size}-${highContrast}-${labelText}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const color = operatorColor(opName) || '#64748b';
  const baseW = size === 'compact' ? 16 : size === 'large' ? 23 : 19;
  const w = Math.round(baseW * (isSelected ? 1.22 : 1));
  const h = Math.round(w * (31 / 22));

  const stroke = isSelected
    ? '#ffffff'
    : highContrast
    ? '#09090b'
    : '#1e1e26';
  const strokeWidth = isSelected ? 2 : highContrast ? 1.7 : 1.3;

  // Classic solid teardrop: smooth circular dome on top tapering to the tip at (11, 30.2)
  const svg = `<svg class="bts-pin-svg" width="${w}" height="${h}" viewBox="0 0 22 31" xmlns="http://www.w3.org/2000/svg">
    <path d="M11 1.2C5.6 1.2 1.5 5.3 1.5 10.6c0 6.1 7.1 16.1 8.8 19.1.35.6 1.05.6 1.4 0 1.7-3 8.8-13 8.8-19.1 0-5.3-4.1-9.4-9.5-9.4Z" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>
  </svg>`;

  const html = `<div class="bts-pin ${isSelected ? 'is-selected' : ''} ${highContrast ? 'is-contrast' : ''}" style="width:${w}px;height:${h}px">
    ${svg}
    ${labelText ? `<span class="bts-pin-label">${escapeHtml(labelText)}</span>` : ''}
  </div>`;

  const icon = L.divIcon({
    className: 'bts-pin-leaflet-icon',
    html,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    tooltipAnchor: [0, -h + 2],
  });

  iconCache.set(cacheKey, icon);
  return icon;
}

/**
 * Slim label marker: compact pill with an operator dot and station ID.
 */
export function getBtsBadgeIcon(tower: Tower, options: PinOptions): L.DivIcon {
  const { isSelected, size, labelsMode, highContrast } = options;
  const opName = tower.operators[0]?.name || 'UKE';
  const color = operatorColor(opName) || '#64748b';
  const stationId = tower.stationId || tower.id.slice(0, 8);
  const isBtmap = tower.source === 'BTMAP';
  const text =
    labelsMode === 'full'
      ? `${stationId} · ${opName}`
      : stationId || opName;

  const cacheKey = `badge-v3-${opName}-${isBtmap}-${isSelected}-${size}-${highContrast}-${text}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const h = size === 'compact' ? 16 : size === 'large' ? 21 : 18;
  const fontSize = size === 'compact' ? 9 : size === 'large' ? 11 : 10;

  const html = `<div class="bts-badge ${isSelected ? 'is-selected' : ''} ${highContrast ? 'is-contrast' : ''}" style="--op:${color};height:${h}px;font-size:${fontSize}px">
    <i class="bts-badge-dot"></i><span>${escapeHtml(text)}</span>
  </div>`;

  const icon = L.divIcon({
    className: 'bts-badge-leaflet-icon',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    tooltipAnchor: [0, -Math.round(h / 2) - 2],
  });

  iconCache.set(cacheKey, icon);
  return icon;
}
