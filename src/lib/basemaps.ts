import {readStored} from './constants';

export type BasemapId='osm'|'satellite'|'terrain'|'google';
export const GOOGLE_MAPS_KEY=(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
export const BASEMAPS=[
  {id:'osm',name:'OpenStreetMap',description:'Ulice i miejscowości',kind:'street'},
  {id:'satellite',name:'Satelita Esri',description:'Zdjęcia satelitarne',kind:'satellite'},
  {id:'terrain',name:'Mapa terenowa',description:'Esri · topografia',kind:'terrain'},
  {id:'google',name:'Google Satellite',description:GOOGLE_MAPS_KEY?'Zdjęcia Google Maps':'Chwilowo niedostępne',kind:'satellite'},
] as const;

export function getStoredBasemap():BasemapId {
  const stored=readStored<unknown>('btmap.basemap','osm');
  return BASEMAPS.some(item=>item.id===stored)&&(stored!=='google'||GOOGLE_MAPS_KEY)?stored as BasemapId:'osm';
}

export const TILE_SOURCES={
  osm:{url:import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:import.meta.env.VITE_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'},
  satellite:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',attribution:'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'},
  terrain:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',attribution:'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, Intermap, USGS, METI/NASA, NGA, EPA, NPS, and the GIS User Community'},
};
