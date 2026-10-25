export type Theme = 'light' | 'dark';
export type View = 'map' | 'database' | 'stats' | 'guides' | 'admin' | 'changelog';
export interface Band { tech:string; band:string; status?:string; permit?:string; azimuth?:number; }
export interface Operator { name:string; color?:string; bands:Band[]; stationIds?:string[]; ukePermitId?:string; }
export interface PemReportSummary { count:number; partial:boolean; checkedAt:string; }
export interface Tower { id:string; stationId?:string; address:string; province:string; lat:number; lng:number; operators:Operator[]; source:'BTMAP' | 'UKE' | string; notes?:string; height?:number; mastType?:string; createdAt?:string; pemReportsByOperator?:Record<string,PemReportSummary>; azimuths?:number[]; }
export interface Filters { operators:string[]; techs:string[]; bands:string[]; province:string; source?:'ALL'|'BTMAP'|'UKE'; }
export interface TowerResult { items:Tower[]; total:number; limit:number; hasMore:boolean; }
export interface Bounds { minLat:number; maxLat:number; minLng:number; maxLng:number; zoom:number; }
export interface User { id:string; email:string; nick:string; role:string; points:number; level:number; }
export interface Comment { id:string; userNick:string; text:string; createdAt:string; }
export interface Count { name:string; count:number; }
export interface Health { status:string; version:string; stats:{ towers:number; btmapTowers?:number; ukeTowers?:number; operators:Count[]; technologies:Count[]; provinces:Count[] }; metadata:Record<string,string>; }
export interface Submission { id:string; type:string; status:string; createdAt:string; userNick?:string; data?:any; }
export interface Radioline { id:string; latA:number; lngA:number; latB:number; lngB:number; frequency:number; operator:string; }

export interface StatsOperatorItem {
  name: string;
  towers: number;
  permits: number;
  percent: number;
}

export interface StatsTechItem {
  tech: string;
  towers: number;
  permits: number;
  percent: number;
}

export interface StatsBandItem {
  key: string;
  tech: string;
  band: string;
  total: number;
  operators: { operator: string; count: number }[];
}

export interface StatsProvinceItem {
  province: string;
  total: number;
  operators: { operator: string; count: number }[];
}

export interface TelecomStats {
  source: 'ALL' | 'BTMAP' | 'UKE';
  summary: {
    totalTowers: number;
    totalPermits: number;
    totalCells: number;
  };
  technologies: StatsTechItem[];
  operators: StatsOperatorItem[];
  bands: StatsBandItem[];
  provinces: StatsProvinceItem[];
  updatedAt: string;
}
