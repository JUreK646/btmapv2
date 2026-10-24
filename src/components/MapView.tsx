import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  ScaleControl,
  CircleMarker,
  Circle,
  Tooltip,
  Polyline,
  Polygon,
  Marker,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import BaseLayer from './BaseLayer';
import type { BasemapId } from '../lib/basemaps';
import 'leaflet/dist/leaflet.css';
import type { Bounds, Radioline, Theme, Tower } from '../types';
import { operatorColor } from '../lib/constants';
import { MAP_STATION_LIMIT } from '../../shared/mapLimits';
import PemPlanMarkers from './PemPlanMarkers';
import type { PemPlan } from '../../shared/pemPlans';
import { operatorName } from '../../shared/operators';

function MapEvents({
  onBounds,
  onReady,
  onMapClick,
}: {
  onBounds: (bounds: Bounds) => void;
  onReady: (map: L.Map) => void;
  onMapClick?: (lat: number, lng: number) => void;
}) {
  const map = useMap();
  const report = () => {
    const b = map.getBounds();
    onBounds({
      minLat: Math.max(-90, b.getSouth()),
      maxLat: Math.min(90, b.getNorth()),
      minLng: Math.max(-180, b.getWest()),
      maxLng: Math.min(180, b.getEast()),
      zoom: map.getZoom(),
    });
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
}) {
  return (
    <>
      {items.map(t => (
        <Fragment key={t.id}>
          <CircleMarker
            center={[t.lat, t.lng]}
            radius={selected === t.id ? 11 : t.operators.length > 1 ? 7 : 6}
            renderer={renderer}
            pathOptions={{
              color:
                selected === t.id && theme === 'light'
                  ? '#086c60'
                  : theme === 'light' && operatorName(t.operators[0]?.name || '') === 'Plus'
                  ? '#244230'
                  : '#fff',
              weight: selected === t.id ? 4 : 2,
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
              <strong>{t.address}</strong>
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
              radius={2.5}
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

function AzimuthBeams({
  items,
  enabled,
  selectedId,
  renderer,
}: {
  items: Tower[];
  enabled: boolean;
  selectedId?: string;
  renderer: L.Canvas;
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

  if (!enabled) return null;

  // Show azimuths only when zoomed in closely (zoom >= 14 - neighborhood/village level),
  // or always for the currently selected station.
  const showAll = zoom >= 14;
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

  if (targetTowers.length === 0) return null;

  // Scaled cone radius in meters:
  // zoom 14: 180m, zoom 15: 150m, zoom 16: 130m, zoom 17+: 110m
  const radiusM = zoom >= 17 ? 110 : zoom >= 16 ? 130 : zoom >= 15 ? 150 : 180;
  const beamwidthDeg = 44;

  return (
    <>
      {targetTowers.map(t => {
        const azs = t.azimuths || [];
        const opColor = operatorColor(t.operators[0]?.name) || '#f59e0b';
        const latRad = (t.lat * Math.PI) / 180;

        return (
          <Fragment key={`az-group-${t.id}`}>
            {/* Sector Cones / Wedges */}
            {azs.map(az => {
              const poly = sectorPolygon(t.lat, t.lng, az, radiusM, beamwidthDeg);
              return (
                <Polygon
                  key={`poly-${t.id}-${az}`}
                  positions={poly}
                  renderer={renderer}
                  pathOptions={{
                    color: opColor,
                    weight: 1.5,
                    opacity: 0.65,
                    fillColor: opColor,
                    fillOpacity: 0.22,
                  }}
                  interactive={false}
                />
              );
            })}

            {/* Subtle centerline ray inside each sector cone */}
            {azs.map(az => {
              const rayEnd: [number, number] = [
                t.lat + (radiusM * Math.cos((az * Math.PI) / 180)) / 111320,
                t.lng + (radiusM * Math.sin((az * Math.PI) / 180)) / (111320 * Math.cos(latRad)),
              ];
              return (
                <Polyline
                  key={`ray-${t.id}-${az}`}
                  positions={[[t.lat, t.lng], rayEnd]}
                  renderer={renderer}
                  pathOptions={{
                    color: opColor,
                    weight: 1.2,
                    opacity: 0.45,
                  }}
                  interactive={false}
                />
              );
            })}

            {/* Azimuth Degree Labels centered INSIDE each sector cone */}
            {azs.map(az => {
              // Placed at 60% of the radius, squarely inside the sector cone
              const labelDistM = radiusM * 0.60;
              const dLat = (labelDistM * Math.cos((az * Math.PI) / 180)) / 111320;
              const dLng = (labelDistM * Math.sin((az * Math.PI) / 180)) / (111320 * Math.cos(latRad));
              const labelPos: [number, number] = [t.lat + dLat, t.lng + dLng];

              const icon = L.divIcon({
                className: 'az-beam-label',
                html: `<span>${az}°</span>`,
                iconSize: [44, 18],
                iconAnchor: [22, 9],
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
}) {
  const markers = items.slice(0, MAP_STATION_LIMIT);
  const visible =
    selected && !markers.some(t => t.id === selected.id)
      ? [...markers.slice(0, MAP_STATION_LIMIT - 1), selected]
      : markers;

  const canvasRenderer = useMemo(() => L.canvas({ padding: 0.5 }), []);
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

  return (
    <MapContainer
      center={[52.2305, 21.0084]}
      zoom={12}
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
      <MapEvents onBounds={onBounds} onReady={onReady} onMapClick={handleMapClick} />
      <AzimuthBeams
        items={visible}
        enabled={Boolean(showAzimuths)}
        selectedId={selected?.id}
        renderer={canvasRenderer}
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
      />
      <PemPlanMarkers items={pemPlans} />

      {/* Radiolines */}
      {radiolines.map(line => (
        <Polyline
          key={line.id}
          positions={[
            [line.latA, line.lngA],
            [line.latB, line.lngB],
          ]}
          renderer={canvasRenderer}
          pathOptions={{ color: operatorColor(line.operator), weight: 2, dashArray: '6 6' }}
        >
          <Tooltip>
            {line.operator} · {line.frequency} MHz
          </Tooltip>
        </Polyline>
      ))}

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
