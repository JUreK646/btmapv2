import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  ScaleControl,
  CircleMarker,
  Circle,
  Tooltip,
  Popup,
  Polyline,
  Polygon,
  Marker,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import { Check, Copy, MapPin, X } from 'lucide-react';
import BaseLayer from './BaseLayer';
import type { BasemapId } from '../lib/basemaps';
import 'leaflet/dist/leaflet.css';
import type { Bounds, Radioline, RadiolineChannel, Theme, Tower } from '../types';
import { operatorColor, readStored, saveStored } from '../lib/constants';
import { MAP_STATION_LIMIT } from '../../shared/mapLimits';
import PemPlanMarkers from './PemPlanMarkers';
import type { PemPlan } from '../../shared/pemPlans';
import { operatorName } from '../../shared/operators';
import { getBtsPinIcon, getBtsBadgeIcon } from './pinIcons';
import type { AppSettings } from '../lib/settings';

function MapEvents({
  onBounds,
  onReady,
  onMapClick,
  rememberLocation,
}: {
  onBounds: (bounds: Bounds) => void;
  onReady: (map: L.Map) => void;
  onMapClick?: (lat: number, lng: number) => void;
  rememberLocation?: boolean;
}) {
  const map = useMap();
  const report = () => {
    const b = map.getBounds();
    const c = map.getCenter();
    const z = map.getZoom();
    onBounds({
      minLat: Math.max(-90, b.getSouth()),
      maxLat: Math.min(90, b.getNorth()),
      minLng: Math.max(-180, b.getWest()),
      maxLng: Math.min(180, b.getEast()),
      zoom: z,
    });
    if (rememberLocation) {
      saveStored('btmap.mapCenter', { lat: c.lat, lng: c.lng, zoom: z });
    }
  };
  useMapEvents({
    moveend: report,
    click: e => {
      if (onMapClick) onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  useEffect(() => {
    onReady(map);
    report();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function Stations({
  items,
  selected,
  onSelect,
  theme,
  isPickingTerrainTarget,
  onTerrainTargetChange,
  isPickingEvalTarget,
  onEvalTargetChange,
  renderer,
  settings,
}: {
  items: Tower[];
  selected?: string;
  onSelect: (tower: Tower) => void;
  theme: Theme;
  isPickingTerrainTarget?: boolean;
  onTerrainTargetChange?: (coords: [number, number]) => void;
  isPickingEvalTarget?: boolean;
  onEvalTargetChange?: (coords: [number, number]) => void;
  renderer: L.Canvas;
  settings?: AppSettings;
}) {
  const shape = settings?.markerShape || 'dots';
  const size = settings?.markerSize || 'normal';
  const labelsMode = settings?.showStationLabels || 'none';
  const highContrast = Boolean(settings?.highContrastMarkers);
  const sizeMultiplier = size === 'compact' ? 0.78 : size === 'large' ? 1.3 : 1.0;

  if (shape === 'pins') {
    return (
      <>
        {items.map(t => {
          const isSel = selected === t.id;
          const icon = getBtsPinIcon(t, {
            isSelected: isSel,
            size,
            labelsMode,
            highContrast,
          });
          const tipOffset: [number, number] = [0, -4];

          return (
            <Marker
              key={t.id}
              position={[t.lat, t.lng]}
              icon={icon}
              zIndexOffset={isSel ? 1000 : t.source === 'BTMAP' ? 100 : 0}
              eventHandlers={{
                click: e => {
                  L.DomEvent.stopPropagation(e);
                  if (isPickingEvalTarget && onEvalTargetChange) {
                    onEvalTargetChange([t.lat, t.lng]);
                  } else if (isPickingTerrainTarget && onTerrainTargetChange) {
                    onTerrainTargetChange([t.lat, t.lng]);
                  } else {
                    onSelect(t);
                  }
                },
              }}
            >
              <Tooltip direction="top" offset={tipOffset}>
                <strong>{t.address}</strong> <small style={{ opacity: 0.8, marginLeft: '4px' }}>{t.source === 'BTMAP' ? '· BTMap' : '· UKE'}</small>
                <br />
                {t.operators
                  .map(op => {
                    const sid = op.stationIds?.[0] || (t.operators.length === 1 ? t.stationId : '');
                    return sid ? `${op.name} (${sid})` : op.name;
                  })
                  .join(' · ')}
              </Tooltip>
            </Marker>
          );
        })}
      </>
    );
  }

  if (shape === 'badges') {
    return (
      <>
        {items.map(t => {
          const isSel = selected === t.id;
          const icon = getBtsBadgeIcon(t, {
            isSelected: isSel,
            size,
            labelsMode,
            highContrast,
          });

          return (
            <Marker
              key={t.id}
              position={[t.lat, t.lng]}
              icon={icon}
              zIndexOffset={isSel ? 1000 : 0}
              eventHandlers={{
                click: e => {
                  L.DomEvent.stopPropagation(e);
                  if (isPickingEvalTarget && onEvalTargetChange) {
                    onEvalTargetChange([t.lat, t.lng]);
                  } else if (isPickingTerrainTarget && onTerrainTargetChange) {
                    onTerrainTargetChange([t.lat, t.lng]);
                  } else {
                    onSelect(t);
                  }
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -4]}>
                <strong>{t.address}</strong> <small style={{ opacity: 0.8, marginLeft: '4px' }}>{t.source === 'BTMAP' ? '· BTMap' : '· UKE'}</small>
                <br />
                {t.operators
                  .map(op => {
                    const sid = op.stationIds?.[0] || (t.operators.length === 1 ? t.stationId : '');
                    return sid ? `${op.name} (${sid})` : op.name;
                  })
                  .join(' · ')}
              </Tooltip>
            </Marker>
          );
        })}
      </>
    );
  }

  // Classic Dots (Canvas CircleMarker)
  return (
    <>
      {items.map(t => (
        <Fragment key={t.id}>
          <CircleMarker
            center={[t.lat, t.lng]}
            radius={(selected === t.id ? 11 : t.source === 'BTMAP' ? 8 : (t.operators.length > 1 ? 7 : 6)) * sizeMultiplier}
            renderer={renderer}
            pathOptions={{
              color:
                selected === t.id && theme === 'light'
                  ? '#086c60'
                  : t.source === 'BTMAP'
                  ? '#00e5ff'
                  : theme === 'light' && operatorName(t.operators[0]?.name || '') === 'Plus'
                  ? '#244230'
                  : highContrast
                  ? '#ffffff'
                  : '#fff',
              weight: (selected === t.id ? 4 : t.source === 'BTMAP' ? 3 : 2) + (highContrast ? 1.5 : 0),
              fillColor: operatorColor(t.operators[0]?.name),
              fillOpacity: 1,
            }}
            eventHandlers={{
              click: e => {
                L.DomEvent.stopPropagation(e);
                if (isPickingEvalTarget && onEvalTargetChange) {
                  onEvalTargetChange([t.lat, t.lng]);
                } else if (isPickingTerrainTarget && onTerrainTargetChange) {
                  onTerrainTargetChange([t.lat, t.lng]);
                } else {
                  onSelect(t);
                }
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              <strong>{t.address}</strong> <small style={{opacity:0.8,marginLeft:'4px'}}>{t.source === 'BTMAP' ? '· BTMap' : '· UKE'}</small>
              <br />
              {t.operators
                .map(op => {
                  const sid = op.stationIds?.[0] || (t.operators.length === 1 ? t.stationId : '');
                  return sid ? `${op.name} (${sid})` : op.name;
                })
                .join(' · ')}
            </Tooltip>
          </CircleMarker>
          {t.operators.length > 1 && (
            <CircleMarker
              center={[t.lat, t.lng]}
              radius={2.5 * sizeMultiplier}
              renderer={renderer}
              pathOptions={{ weight: 0, fillColor: '#fff', fillOpacity: 1 }}
              interactive={false}
            />
          )}
        </Fragment>
      ))}
    </>
  );
}

function sectorPolygon(
  lat: number,
  lng: number,
  azimuthDeg: number,
  radiusM = 320,
  beamwidthDeg = 65
): [number, number][] {
  const points: [number, number][] = [[lat, lng]];
  const startAng = (azimuthDeg - beamwidthDeg / 2) * (Math.PI / 180);
  const endAng = (azimuthDeg + beamwidthDeg / 2) * (Math.PI / 180);
  const steps = 16;
  const latRadius = radiusM / 111320;
  const lngRadius = radiusM / (111320 * Math.cos(lat * (Math.PI / 180)));

  for (let i = 0; i <= steps; i++) {
    const ang = startAng + (i / steps) * (endAng - startAng);
    const pLat = lat + Math.cos(ang) * latRadius;
    const pLng = lng + Math.sin(ang) * lngRadius;
    points.push([pLat, pLng]);
  }
  points.push([lat, lng]);
  return points;
}

const rxIcon = L.divIcon({
  className: '',
  html: `<div class="tp-rx-pin"><div class="tp-rx-bubble"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg></div><span class="tp-rx-lbl">Odbiornik</span></div>`,
  iconSize: [110, 32],
  iconAnchor: [14, 16],
});

const evalIcon = L.divIcon({
  className: '',
  html: `<div class="ae-map-pin"><div class="ae-map-pin-pulse"></div><div class="ae-map-pin-inner"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/><path d="M4 6h.01"/><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/><path d="M16.24 7.76A6 6 0 1 0 8.23 16.23"/><circle cx="12" cy="12" r="2"/></svg></div><span class="ae-map-pin-lbl">Punkt audytu</span></div>`,
  iconSize: [120, 32],
  iconAnchor: [16, 16],
});

export interface HighlightedSector {
  towerId: string;
  azimuth: number;
  sectorNum?: number;
  cellId?: number;
  eci?: number;
  label?: string;
}

function AzimuthBeams({
  items,
  enabled,
  selectedId,
  highlightedSector,
  renderer,
  settings,
}: {
  items: Tower[];
  enabled: boolean;
  selectedId?: string;
  highlightedSector?: HighlightedSector | null;
  renderer: L.Canvas;
  settings?: AppSettings;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  const [center, setCenter] = useState(map.getCenter());

  useMapEvents({
    zoomend: () => {
      setZoom(map.getZoom());
      setCenter(map.getCenter());
    },
    moveend: () => {
      setCenter(map.getCenter());
    },
  });

  const autoSelected = Boolean(settings?.autoShowAzimuthsOnSelect && selectedId);
  if (!enabled && !autoSelected && !highlightedSector) return null;

  // Show azimuths only when zoomed in closely (zoom >= 14 - neighborhood/village level),
  // or always for the currently selected station or highlighted sector.
  const showAll = enabled && zoom >= 14;
  let targetTowers: Tower[] = [];

  if (showAll) {
    // Only pick up to 25 stations closest to screen center to keep the map clean and light
    const withAz = items.filter(t => Array.isArray(t.azimuths) && t.azimuths.length > 0);
    if (withAz.length <= 25) {
      targetTowers = withAz;
    } else {
      const cLat = center.lat;
      const cLng = center.lng;
      const sorted = [...withAz].sort((a, b) => {
        const da = (a.lat - cLat) ** 2 + (a.lng - cLng) ** 2;
        const db = (b.lat - cLat) ** 2 + (b.lng - cLng) ** 2;
        return da - db;
      });
      targetTowers = sorted.slice(0, 25);
    }
  } else if (selectedId) {
    targetTowers = items.filter(t => t.id === selectedId && Array.isArray(t.azimuths) && t.azimuths.length > 0);
  }

  // Ensure station with highlighted sector is always included
  if (highlightedSector) {
    const hlTower = items.find(t => t.id === highlightedSector.towerId);
    if (hlTower && !targetTowers.some(t => t.id === hlTower.id)) {
      targetTowers = [hlTower, ...targetTowers];
    }
  }

  if (targetTowers.length === 0) return null;

  // Scaled cone radius in meters:
  const lengthMul = settings?.azimuthLength === 'short' ? 0.75 : settings?.azimuthLength === 'long' ? 1.45 : 1.0;
  const radiusM = (zoom >= 17 ? 110 : zoom >= 16 ? 130 : zoom >= 15 ? 150 : 180) * lengthMul;
  const beamwidthDeg = 44;

  const fillOpacity = settings?.azimuthOpacity ? settings.azimuthOpacity * 0.55 : 0.22;
  const strokeOpacity = settings?.azimuthOpacity ? Math.min(1.0, settings.azimuthOpacity * 1.5) : 0.65;

  return (
    <>
      {targetTowers.map(t => {
        const rawAzs = t.azimuths || [];
        const isHlTower = Boolean(highlightedSector && highlightedSector.towerId === t.id);
        const azs = isHlTower && highlightedSector && !rawAzs.includes(highlightedSector.azimuth)
          ? [...rawAzs, highlightedSector.azimuth].sort((a, b) => a - b)
          : rawAzs;
        const opColor = operatorColor(t.operators[0]?.name) || '#f59e0b';
        const latRad = (t.lat * Math.PI) / 180;

        return (
          <Fragment key={`az-group-${t.id}`}>
            {/* Sector Cones / Wedges */}
            {azs.map(az => {
              const isTargetSector = Boolean(isHlTower && highlightedSector && highlightedSector.azimuth === az);
              const poly = sectorPolygon(
                t.lat,
                t.lng,
                az,
                isTargetSector ? radiusM * 1.3 : radiusM,
                isTargetSector ? 50 : beamwidthDeg
              );
              return (
                <Polygon
                  key={`poly-${t.id}-${az}`}
                  positions={poly}
                  renderer={renderer}
                  pathOptions={{
                    color: isTargetSector ? '#00e5ff' : opColor,
                    weight: isTargetSector ? 3.5 : 1.5,
                    opacity: isTargetSector ? 1.0 : strokeOpacity,
                    fillColor: isTargetSector ? '#00e5ff' : opColor,
                    fillOpacity: isTargetSector ? 0.65 : fillOpacity,
                  }}
                  interactive={false}
                />
              );
            })}

            {/* Subtle centerline ray inside each sector cone */}
            {azs.map(az => {
              const isTargetSector = Boolean(isHlTower && highlightedSector && highlightedSector.azimuth === az);
              const rayLen = isTargetSector ? radiusM * 1.35 : radiusM;
              const rayEnd: [number, number] = [
                t.lat + (rayLen * Math.cos((az * Math.PI) / 180)) / 111320,
                t.lng + (rayLen * Math.sin((az * Math.PI) / 180)) / (111320 * Math.cos(latRad)),
              ];
              return (
                <Polyline
                  key={`ray-${t.id}-${az}`}
                  positions={[[t.lat, t.lng], rayEnd]}
                  renderer={renderer}
                  pathOptions={{
                    color: isTargetSector ? '#ffffff' : opColor,
                    weight: isTargetSector ? 2.8 : 1.2,
                    opacity: isTargetSector ? 1.0 : strokeOpacity * 0.7,
                  }}
                  interactive={false}
                />
              );
            })}

            {/* Azimuth Degree Labels centered INSIDE each sector cone */}
            {azs.map(az => {
              const isTargetSector = Boolean(isHlTower && highlightedSector && highlightedSector.azimuth === az);
              const labelDistM = (isTargetSector ? radiusM * 1.3 : radiusM) * 0.60;
              const dLat = (labelDistM * Math.cos((az * Math.PI) / 180)) / 111320;
              const dLng = (labelDistM * Math.sin((az * Math.PI) / 180)) / (111320 * Math.cos(latRad));
              const labelPos: [number, number] = [t.lat + dLat, t.lng + dLng];

              const icon = L.divIcon({
                className: `az-beam-label ${isTargetSector ? 'is-target' : ''}`,
                html: isTargetSector && highlightedSector
                  ? `<span>🎯 ${highlightedSector.sectorNum ? `Sektor ${highlightedSector.sectorNum} · ` : ''}${az}°</span>`
                  : `<span>${az}°</span>`,
                iconSize: isTargetSector ? [120, 24] : [44, 18],
                iconAnchor: isTargetSector ? [60, 12] : [22, 9],
              });

              return (
                <Marker
                  key={`lbl-${t.id}-${az}`}
                  position={labelPos}
                  icon={icon}
                  interactive={false}
                />
              );
            })}
          </Fragment>
        );
      })}
    </>
  );
}

function computeHaversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371.0;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}

type RadiolineBrandKind =
  | 'orange'
  | 'play'
  | 'tmobile'
  | 'plus'
  | 'emitel'
  | 'netia'
  | 'exatel'
  | 'tauron'
  | 'pge'
  | 'enea'
  | 'other';

interface RadiolineBrand {
  kind: RadiolineBrandKind;
  displayName: string;
  color: string;
}

function getRadiolineBrand(line: Radioline): RadiolineBrand {
  const op = line.operator;
  const rawUpper = (line.operatorRaw || '').toUpperCase();

  if (op === 'Orange' || rawUpper.includes('ORANGE') || rawUpper.includes('NETWORKS')) {
    return {
      kind: 'orange',
      displayName: rawUpper.includes('NETWORKS') ? 'NetWorkS!' : 'Orange Polska',
      color: '#ff7900',
    };
  }
  if (op === 'Play' || rawUpper.includes('PLAY') || rawUpper.includes('P4')) {
    return {
      kind: 'play',
      displayName: 'Play',
      color: '#7137c8',
    };
  }
  if (op === 'T-Mobile' || rawUpper.includes('T-MOBILE')) {
    return {
      kind: 'tmobile',
      displayName: 'T-Mobile Polska',
      color: '#e20074',
    };
  }
  if (
    op === 'Plus' ||
    rawUpper.includes('PLUS') ||
    rawUpper.includes('TOWERLINK') ||
    rawUpper.includes('POLKOMTEL') ||
    rawUpper.includes('CELLNEX') ||
    rawUpper.includes('AERO')
  ) {
    return {
      kind: 'plus',
      displayName: rawUpper.includes('TOWERLINK') ? 'Plus (Towerlink)' : 'Plus',
      color: '#00b140',
    };
  }
  if (rawUpper.includes('EMITEL')) {
    return { kind: 'emitel', displayName: 'EmiTel', color: '#0284c7' };
  }
  if (rawUpper.includes('NETIA')) {
    return { kind: 'netia', displayName: 'Netia', color: '#009fe3' };
  }
  if (rawUpper.includes('EXATEL')) {
    return { kind: 'exatel', displayName: 'EXATEL', color: '#ea580c' };
  }
  if (rawUpper.includes('TAURON')) {
    return { kind: 'tauron', displayName: 'Tauron Dystrybucja', color: '#d9006c' };
  }
  if (rawUpper.includes('PGE')) {
    return { kind: 'pge', displayName: 'PGE Dystrybucja', color: '#f59e0b' };
  }
  if (rawUpper.includes('ENEA')) {
    return { kind: 'enea', displayName: 'ENEA Operator', color: '#2563eb' };
  }

  const cleaned = (line.operatorRaw || line.operator || 'Operator')
    .replace(/\b(S\.?A\.?|SP\.?\s*Z\s*O\.?O\.?|SPÓŁKA AKCYJNA)\b/gi, '')
    .trim();
  const displayName =
    cleaned.length > 2
      ? cleaned.toLowerCase().replace(/(^|\s|-)\S/g, m => m.toUpperCase())
      : line.operatorRaw || 'Inny operator';

  return {
    kind: 'other',
    displayName,
    color: '#64748b',
  };
}

function RadiolineOperatorIcon({ brand }: { brand: RadiolineBrand }) {
  switch (brand.kind) {
    case 'orange':
      return (
        <span className="rl-op-img-wrap is-square">
          <img src="/logos/orange.svg" alt="Orange" className="rl-op-img" />
        </span>
      );
    case 'tmobile':
      return (
        <span className="rl-op-img-wrap is-square">
          <img src="/logos/tmobile.svg" alt="T-Mobile" className="rl-op-img" />
        </span>
      );
    case 'play':
      return (
        <span className="rl-op-img-wrap is-play">
          <img src="/logos/play.svg" alt="Play" className="rl-op-img" />
        </span>
      );
    case 'plus':
      return (
        <span className="rl-op-img-wrap is-plus">
          <img src="/logos/plus.svg" alt="Plus" className="rl-op-img" />
        </span>
      );
    case 'emitel':
      return (
        <span className="rl-op-img-wrap is-emitel">
          <img src="/logos/emitel.svg" alt="EmiTel" className="rl-op-img" />
        </span>
      );
    case 'netia':
      return (
        <span className="rl-op-img-wrap is-square is-white-bg">
          <img src="/logos/netia.png" alt="Netia" className="rl-op-img" />
        </span>
      );
    case 'tauron':
      return (
        <span className="rl-op-img-wrap is-square is-white-bg">
          <img src="/logos/tauron.png" alt="Tauron" className="rl-op-img" />
        </span>
      );
    case 'pge':
      return (
        <span className="rl-op-img-wrap is-square is-white-bg">
          <img src="/logos/pge.png" alt="PGE" className="rl-op-img" />
        </span>
      );
    case 'exatel':
      return (
        <span className="rl-op-img-wrap is-square is-white-bg">
          <img src="/logos/exatel.png" alt="EXATEL" className="rl-op-img" />
        </span>
      );
    case 'enea':
      return (
        <span className="rl-op-img-wrap is-square is-white-bg">
          <img src="/logos/enea.png" alt="ENEA" className="rl-op-img" />
        </span>
      );
    default:
      return (
        <svg className="rl-op-svg" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <rect width="24" height="24" rx="4" fill={brand.color} />
          <path
            d="M6.5 17.5L10.5 13.5M14.5 9.5a5 5 0 0 1 0 7.07 5 5 0 0 1-7.07 0l7.07-7.07ZM14 6.5a4 4 0 0 1 3.5 3.5"
            stroke="#ffffff"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      );
  }
}

function createEndpointIcon(letter: 'A' | 'B', color: string): L.DivIcon {
  return L.divIcon({
    className: 'rl-endpoint-leaflet-icon',
    html: `<div class="rl-endpoint-badge" style="--rl-color:${color}">${letter}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function RadiolineCard({
  line,
  onClose,
}: {
  line: Radioline;
  onClose: () => void;
}) {
  const [copiedCoords, setCopiedCoords] = useState(false);

  const brand = getRadiolineBrand(line);
  const distanceKm = line.distanceKm ?? computeHaversineKm(line.latA, line.lngA, line.latB, line.lngB);
  const mode = line.mode || '1+0';
  const capacityText = line.capacityText || '150 Mbps';

  const channels = useMemo<RadiolineChannel[]>(() => {
    if (line.channelsJson) {
      try {
        const parsed = JSON.parse(line.channelsJson);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // Fallback below
      }
    }
    const freqGHz = Number(((line.frequency || 15000) / 1000).toFixed(1));
    return [{ dir: 'A → B', freqGHz, pol: 'H', mbps: 150 }];
  }, [line.channelsJson, line.frequency]);

  const midLat = ((line.latA + line.latB) / 2).toFixed(5);
  const midLng = ((line.lngA + line.lngB) / 2).toFixed(5);
  const coordsStr = `${midLat}, ${midLng}`;

  const handleCopyCoords = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(coordsStr);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 1600);
  };

  return (
    <div className="rl-popup-card" onClick={e => e.stopPropagation()}>
      <div className="rl-popup-header">
        <div className="rl-popup-brand">
          <RadiolineOperatorIcon brand={brand} />
          <div className="rl-popup-title-group">
            <span className="rl-op-name">{brand.displayName}</span>
            {line.permitId && <span className="rl-permit-id">{line.permitId}</span>}
          </div>
        </div>
        <button
          type="button"
          className="rl-icon-btn rl-close-btn"
          onClick={e => {
            e.stopPropagation();
            onClose();
          }}
          title="Zamknij"
        >
          <X size={15} />
        </button>
      </div>

      <div className="rl-popup-summary">
        <span className="rl-dist">{distanceKm.toFixed(2)} km</span>
        <span className="rl-sep">/</span>
        <span className={`rl-mode ${mode === 'XPIC' ? 'is-xpic' : ''}`}>{mode}</span>
        <span className="rl-sep">/</span>
        <span className="rl-cap">
          <span className="rl-cap-arrows">⇅</span> {capacityText}
        </span>
      </div>

      <div className="rl-popup-channels">
        {channels.map((ch, idx) => (
          <div key={idx} className="rl-channel-row">
            <span className="rl-ch-dir">{ch.dir}</span>
            <span className="rl-ch-freq">{ch.freqGHz} GHz</span>
            <span className="rl-ch-pol">{ch.pol}</span>
            <span className="rl-ch-speed">{ch.mbps} Mbps</span>
          </div>
        ))}
      </div>

      <div
        className="rl-popup-footer"
        title={line.stationA && line.stationB ? `A: ${line.stationA} ↔ B: ${line.stationB}` : undefined}
      >
        <div className="rl-footer-coords">
          <MapPin size={13.5} className="rl-pin-icon" />
          <span>{coordsStr}</span>
        </div>
        <button
          type="button"
          className="rl-icon-btn rl-copy-coords-btn"
          onClick={handleCopyCoords}
          title="Skopiuj współrzędne"
        >
          {copiedCoords ? <Check size={13.5} className="rl-copied-icon" /> : <Copy size={13.5} />}
        </button>
      </div>
    </div>
  );
}

function RadiolinesLayer({
  radiolines,
  renderer,
}: {
  radiolines: Radioline[];
  renderer: L.Canvas;
}) {
  const [selectedRl, setSelectedRl] = useState<{ line: Radioline; pos: [number, number] } | null>(null);

  useMapEvents({
    click: () => {
      if (selectedRl) setSelectedRl(null);
    },
  });

  useEffect(() => {
    if (selectedRl && !radiolines.some(r => r.id === selectedRl.line.id)) {
      setSelectedRl(null);
    }
  }, [radiolines, selectedRl]);

  const selectedBrand = useMemo(
    () => (selectedRl ? getRadiolineBrand(selectedRl.line) : null),
    [selectedRl]
  );

  const iconA = useMemo(
    () => (selectedBrand ? createEndpointIcon('A', selectedBrand.color) : null),
    [selectedBrand]
  );
  const iconB = useMemo(
    () => (selectedBrand ? createEndpointIcon('B', selectedBrand.color) : null),
    [selectedBrand]
  );

  if (!radiolines.length) return null;

  return (
    <>
      {radiolines.map(line => {
        const isSelected = selectedRl?.line.id === line.id;
        const brand = getRadiolineBrand(line);
        return (
          <Polyline
            key={line.id}
            positions={[
              [line.latA, line.lngA],
              [line.latB, line.lngB],
            ]}
            renderer={renderer}
            pathOptions={{
              color: brand.color,
              weight: isSelected ? 3.8 : 2.3,
              opacity: isSelected ? 1 : 0.9,
            }}
            eventHandlers={{
              click: e => {
                L.DomEvent.stopPropagation(e);
                const clickedPos: [number, number] = e.latlng
                  ? [e.latlng.lat, e.latlng.lng]
                  : [(line.latA + line.latB) / 2, (line.lngA + line.lngB) / 2];
                setSelectedRl({ line, pos: clickedPos });
              },
            }}
          />
        );
      })}

      {selectedRl && selectedBrand && iconA && iconB && (
        <>
          <Polyline
            positions={[
              [selectedRl.line.latA, selectedRl.line.lngA],
              [selectedRl.line.latB, selectedRl.line.lngB],
            ]}
            renderer={renderer}
            pathOptions={{
              color: selectedBrand.color,
              weight: 8,
              opacity: 0.28,
            }}
            interactive={false}
          />
          <Marker
            position={[selectedRl.line.latA, selectedRl.line.lngA]}
            icon={iconA}
            interactive={false}
          />
          <Marker
            position={[selectedRl.line.latB, selectedRl.line.lngB]}
            icon={iconB}
            interactive={false}
          />
          <Popup
            position={selectedRl.pos}
            closeButton={false}
            autoPan={true}
            className="radioline-leaflet-popup"
            offset={[0, -6]}
            eventHandlers={{
              remove: () => setSelectedRl(null),
            }}
          >
            <RadiolineCard line={selectedRl.line} onClose={() => setSelectedRl(null)} />
          </Popup>
        </>
      )}
    </>
  );
}

export default function MapView({
  theme,
  basemap,
  onBasemapError,
  items,
  selected,
  onSelect,
  onBounds,
  onReady,
  radiolines,
  position,
  pemPlans = [],
  terrainTower,
  terrainTarget,
  terrainAzimuth,
  onTerrainTargetChange,
  isPickingTerrainTarget,
  evalTarget,
  evalRadiusM,
  onEvalTargetChange,
  isPickingEvalTarget,
  showAzimuths,
  highlightedSector,
  settings,
}: {
  theme: Theme;
  basemap: BasemapId;
  onBasemapError: (message: string) => void;
  items: Tower[];
  selected?: Tower | null;
  onSelect: (tower: Tower) => void;
  onBounds: (bounds: Bounds) => void;
  onReady: (map: L.Map) => void;
  radiolines: Radioline[];
  position: [number, number] | null;
  pemPlans?: PemPlan[];
  terrainTower?: Tower | null;
  terrainTarget?: [number, number] | null;
  terrainAzimuth?: number | null;
  onTerrainTargetChange?: (coords: [number, number]) => void;
  isPickingTerrainTarget?: boolean;
  evalTarget?: [number, number] | null;
  evalRadiusM?: number;
  onEvalTargetChange?: (coords: [number, number]) => void;
  isPickingEvalTarget?: boolean;
  showAzimuths?: boolean;
  highlightedSector?: HighlightedSector | null;
  settings?: AppSettings;
}) {
  const markers = items.slice(0, MAP_STATION_LIMIT);
  const visible = useMemo(() => {
    let list = markers;
    if (selected && !list.some(t => t.id === selected.id)) {
      list = [...list.slice(0, MAP_STATION_LIMIT - 1), selected];
    }
    if (highlightedSector && !list.some(t => t.id === highlightedSector.towerId)) {
      const hlTower = items.find(t => t.id === highlightedSector.towerId);
      if (hlTower) {
        list = [hlTower, ...list];
      }
    }
    return list;
  }, [markers, selected, highlightedSector, items]);

  const canvasRenderer = useMemo(() => L.canvas({ padding: 0.5, tolerance: 8 }), []);
  const terrainStation = terrainTower;

  const handleMapClick = (lat: number, lng: number) => {
    if (isPickingEvalTarget && onEvalTargetChange) {
      onEvalTargetChange([lat, lng]);
    } else if (isPickingTerrainTarget && onTerrainTargetChange) {
      onTerrainTargetChange([lat, lng]);
    }
  };

  const sectorCoords = useMemo(() => {
    if (!terrainStation || terrainAzimuth === undefined || terrainAzimuth === null) return null;
    return sectorPolygon(terrainStation.lat, terrainStation.lng, terrainAzimuth);
  }, [terrainStation, terrainAzimuth]);

  // Initial center & zoom from storage if rememberLocation is enabled
  const initialView = useMemo(() => {
    if (settings?.rememberMapLocation) {
      const saved = readStored<{ lat: number; lng: number; zoom: number } | null>('btmap.mapCenter', null);
      if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng) && Number.isFinite(saved.zoom)) {
        return { center: [saved.lat, saved.lng] as [number, number], zoom: saved.zoom };
      }
    }
    return { center: [52.2305, 21.0084] as [number, number], zoom: 12 };
  }, []);

  return (
    <MapContainer
      center={initialView.center}
      zoom={initialView.zoom}
      minZoom={5}
      maxZoom={18}
      zoomControl={false}
      maxBounds={[
        [-85, -180],
        [85, 180],
      ]}
      maxBoundsViscosity={1}
      className={`network-map ${isPickingTerrainTarget ? 'is-picking-target' : ''} ${isPickingEvalTarget ? 'is-picking-eval-target' : ''}`}
      attributionControl={true}
      preferCanvas
    >
      <BaseLayer theme={theme} basemap={basemap} onError={onBasemapError} />
      <ScaleControl position="bottomleft" imperial={false} />
      <MapEvents
        onBounds={onBounds}
        onReady={onReady}
        onMapClick={handleMapClick}
        rememberLocation={settings?.rememberMapLocation}
      />
      <AzimuthBeams
        items={visible}
        enabled={Boolean(showAzimuths)}
        selectedId={selected?.id}
        highlightedSector={highlightedSector}
        renderer={canvasRenderer}
        settings={settings}
      />
      <Stations
        items={visible}
        selected={selected?.id}
        onSelect={onSelect}
        theme={theme}
        isPickingTerrainTarget={isPickingTerrainTarget}
        onTerrainTargetChange={onTerrainTargetChange}
        isPickingEvalTarget={isPickingEvalTarget}
        onEvalTargetChange={onEvalTargetChange}
        renderer={canvasRenderer}
        settings={settings}
      />
      <PemPlanMarkers items={pemPlans} />

      {/* Radiolines */}
      <RadiolinesLayer radiolines={radiolines} renderer={canvasRenderer} />

      {/* User GPS location */}
      {position && (
        <CircleMarker center={position} radius={8} renderer={canvasRenderer} pathOptions={{ fillColor: '#2582eb', fillOpacity: 1, color: '#fff', weight: 3 }}>
          <Tooltip>Twoja lokalizacja</Tooltip>
        </CircleMarker>
      )}

      {/* Terrain Profile: Sector beam cone at base station */}
      {terrainStation && sectorCoords && (
        <Polygon
          positions={sectorCoords}
          renderer={canvasRenderer}
          pathOptions={{
            color: '#a855f7',
            weight: 2,
            fillColor: '#8b5cf6',
            fillOpacity: 0.35,
          }}
          interactive={false}
        />
      )}

      {/* Terrain Profile: Ray line from station to receiver */}
      {terrainStation && terrainTarget && (
        <>
          <Polyline
            positions={[
              [terrainStation.lat, terrainStation.lng],
              terrainTarget,
            ]}
            renderer={canvasRenderer}
            pathOptions={{
              color: '#000000',
              weight: 5,
            }}
            interactive={false}
          />
          <Polyline
            positions={[
              [terrainStation.lat, terrainStation.lng],
              terrainTarget,
            ]}
            renderer={canvasRenderer}
            pathOptions={{
              color: '#0ea5e9',
              weight: 3,
              dashArray: '6 6',
            }}
            interactive={false}
          />
        </>
      )}

      {/* Terrain Profile: Draggable Receiver Pin */}
      {terrainTarget && (
        <Marker
          position={terrainTarget}
          icon={rxIcon}
          draggable={true}
          eventHandlers={{
            dragend: e => {
              const pos = e.target.getLatLng();
              if (onTerrainTargetChange) onTerrainTargetChange([pos.lat, pos.lng]);
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -18]}>
            <strong>Odbiornik</strong> · Przeciągnij w dowolne miejsce
          </Tooltip>
        </Marker>
      )}
      {/* Area Evaluation: Analyzed Area Circle (max 3.0 km²) */}
      {evalTarget && evalRadiusM && (
        <Circle
          center={evalTarget}
          radius={evalRadiusM}
          renderer={canvasRenderer}
          pathOptions={{
            color: '#0ea5e9',
            weight: 2,
            dashArray: '5 6',
            fillColor: '#0ea5e9',
            fillOpacity: 0.12,
          }}
          interactive={false}
        />
      )}

      {/* Area Evaluation: Draggable Center Audit Pin */}
      {evalTarget && (
        <Marker
          position={evalTarget}
          icon={evalIcon}
          draggable={true}
          eventHandlers={{
            dragend: e => {
              const pos = e.target.getLatLng();
              if (onEvalTargetChange) onEvalTargetChange([pos.lat, pos.lng]);
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -18]}>
            <strong>Punkt audytu operatorów</strong>
            <br />
            Promień {Math.round(evalRadiusM || 500)}m · Przeciągnij w dowolne miejsce
          </Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}
