export interface PemMeasurement {
  id:string; point:string; stationIds:string; date:string|null; intensity:number;
  belowSensitivity:boolean; source:string; distance:number; reportUrl:string|null;
}
export interface PemResult {
  items:PemMeasurement[]; radiusMeters:number; limit:number; hasMore:boolean;
  matchedIds:string[]; checkedAt:string;
}
export interface PemAntenna {
  id:string; azimuth:number|null; height:number|null; model:string; manufacturer:string;
  bands:string[]; tilt:number|null; tiltMin:number|null; tiltMax:number|null; eirp:number|null;
  settings?:{band:string;tilt:number|null;min:number|null;max:number|null}[];
  sourcePage?:number;eirpCombined?:boolean;
}
export interface PemReport {
  id:string; number:string; date:string|null; laboratory:string; operator:string;
  stationIds:string[]; downloadUrl:string; antennas:PemAntenna[];
  measurements:{point:string;intensity:number;belowSensitivity:boolean}[];
  kind?:'pdf'|'external';sourceLabel?:string;pdfPages?:number;pdfStatus?:'parsed'|'unrecognized';
}
export interface PemReportsResult { reports:PemReport[]; matchedStations:number; partial:boolean; checkedAt:string;catalogVersion?:number;reportCount?:number; }
