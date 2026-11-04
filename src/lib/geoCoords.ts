import type { Tower } from '../types';

/**
 * Converts a decimal coordinate to DMS (Degrees, Minutes, Seconds) format.
 * e.g. 52.229675 -> 52°13'46.8"N
 */
export function toDms(val: number, isLat: boolean): string {
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  const abs = Math.abs(val);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = ((minFloat - min) * 60).toFixed(1);
  return `${deg}°${String(min).padStart(2, '0')}'${String(sec).padStart(4, '0')}"${dir}`;
}

export function formatDms(lat: number, lng: number): string {
  return `${toDms(lat, true)} ${toDms(lng, false)}`;
}

/**
 * Converts a decimal coordinate to DMM (Degrees and Decimal Minutes / GPS format).
 * e.g. 52.229675 -> 52° 13.780' N
 */
export function toDmm(val: number, isLat: boolean): string {
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  const abs = Math.abs(val);
  const deg = Math.floor(abs);
  const min = ((abs - deg) * 60).toFixed(3);
  return `${deg}° ${String(min).padStart(6, '0')}' ${dir}`;
}

export function formatDmm(lat: number, lng: number): string {
  return `${toDmm(lat, true)}, ${toDmm(lng, false)}`;
}

export function formatDd(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export interface NavProvider {
  id: string;
  name: string;
  descriptionPl: string;
  descriptionEn: string;
  badge: string;
  url: string;
  isNativeGeo?: boolean;
}

export function getNavigationProviders(lat: number, lng: number, title?: string): NavProvider[] {
  const label = encodeURIComponent(title || 'Stacja bazowa');
  return [
    {
      id: 'google-maps',
      name: 'Google Maps',
      descriptionPl: 'Trasa samochodowa, piesza i rowerowa',
      descriptionEn: 'Turn-by-turn driving, walking & cycling route',
      badge: 'GMaps',
      url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    },
    {
      id: 'waze',
      name: 'Waze',
      descriptionPl: 'Nawigacja z aktualnym ruchem drogowym i zdarzeniami',
      descriptionEn: 'Navigation with live traffic, hazards and police',
      badge: 'Waze',
      url: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
    },
    {
      id: 'apple-maps',
      name: 'Apple Maps',
      descriptionPl: 'Dla urządzeń iOS, iPadOS i macOS',
      descriptionEn: 'Native navigation for iOS, iPadOS and macOS',
      badge: 'Apple',
      url: `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`,
    },
    {
      id: 'osm',
      name: 'OpenStreetMap / OsmAnd',
      descriptionPl: 'Otwarta mapa i nawigacja pieszo-terenowa',
      descriptionEn: 'Open map & outdoor navigation',
      badge: 'OSM',
      url: `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=;${lat},${lng}`,
    },
    {
      id: 'geo',
      name: 'Aplikacja w telefonie',
      descriptionPl: 'Otwórz domyślną nawigację (AutoMapa, Yanosik itp.)',
      descriptionEn: 'Open default device navigation via geo: protocol',
      badge: 'geo:',
      url: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
      isNativeGeo: true,
    },
  ];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateStationGpx(tower: Tower): string {
  const name = tower.stationId || tower.id;
  const operators = tower.operators.map(o => o.name).join('/');
  const desc = `${tower.address || 'Stacja bazowa'} (${operators}) [BTMap]`;
  const time = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BTMap v2" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(name)}</name>
    <desc>${escapeXml(desc)}</desc>
    <time>${time}</time>
  </metadata>
  <wpt lat="${tower.lat}" lon="${tower.lng}">
    <name>${escapeXml(name)}</name>
    <desc>${escapeXml(desc)}</desc>
    <sym>Tower</sym>
    <type>Cellular Tower</type>
  </wpt>
</gpx>`;
}

export function downloadStationGpx(tower: Tower): void {
  const gpx = generateStationGpx(tower);
  const blob = new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filename = `BTS_${(tower.stationId || tower.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.gpx`;
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
