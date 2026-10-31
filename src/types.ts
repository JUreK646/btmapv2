export type Theme = 'light' | 'dark';
export type View = 'map' | 'database' | 'stats' | 'kmz' | 'guides' | 'admin' | 'changelog';
export interface Band { tech:string; band:string; status?:string; permit?:string; azimuth?:number; }
export interface Operator { name:string; color?:string; bands:Band[]; stationIds?:string[]; ukePermitId?:string; }
export interface PemReportSummary { count:number; partial:boolean; checkedAt:string; }
export interface Tower { id:string; stationId?:string; address:string; province:string; lat:number; lng:number; operators:Operator[]; source:'BTMAP' | 'UKE' | string; notes?:string; height?:number; mastType?:string; createdAt?:string; pemReportsByOperator?:Record<string,PemReportSummary>; azimuths?:number[]; }
export interface Filters { operators:string[]; techs:string[]; bands:string[]; province:string; source?:'ALL'|'BTMAP'|'UKE'; }
export interface TowerResult { items:Tower[]; total:number; limit:number; hasMore:boolean; }
export interface Bounds { minLat:number; maxLat:number; minLng:number; maxLng:number; zoom:number; }
export interface User { id:string; email:string; nick:string; role:string; points:number; level:number; }
export interface Comment { id:string; towerId:string; userNick:string; text:string; photoUrl?:string; createdAt:string; }
export interface Photo { id:string; towerId:string; userNick:string; url:string; caption?:string; createdAt:string; }
export interface Count { name:string; count:number; }
export interface Health { status:string; version:string; stats:{ towers:number; btmapTowers?:number; ukeTowers?:number; operators:Count[]; technologies:Count[]; provinces:Count[] }; metadata:Record<string,string>; }
export interface Submission { id:string; type:string; status:string; createdAt:string; userNick?:string; data?:any; }
export interface RadiolineChannel {
  dir: string;
  freqGHz: number;
  freqMHz?: number;
  pol: string;
  mbps: number;
  rowId?: string;
  channelNum?: string;
  planSymbol?: string;
  widthMHz?: number;
  modulation?: string;
  eirpDbm?: number;
  txLat?: number;
  txLng?: number;
  txHeightM?: number;
  txCity?: string;
  txProvince?: string;
  txStreet?: string;
  txAntType?: string;
  txAntManufacturer?: string;
  txAntGainDbi?: number;
  txAntHeightM?: number;
  txTransmitterType?: string;
  txManufacturer?: string;
  rxLat?: number;
  rxLng?: number;
  rxHeightM?: number;
  rxCity?: string;
  rxProvince?: string;
  rxStreet?: string;
  rxAntType?: string;
  rxAntManufacturer?: string;
  rxAntGainDbi?: number;
  rxAntHeightM?: number;
  rxNoiseFigureDb?: number;
  rxAttenuationDb?: number;
  permitType?: string;
  issueDate?: string;
  expiryDate?: string;
  snapshotDate?: string;
}
export interface Radioline {
  id: string;
  latA: number;
  lngA: number;
  latB: number;
  lngB: number;
  frequency: number;
  operator: string;
  stationA?: string;
  stationB?: string;
  operatorRaw?: string;
  permitId?: string;
  distanceKm?: number;
  mode?: string;
  capacityText?: string;
  channelsJson?: string;
}

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

export interface TowerHistoryEvent {
  id: string;
  userNick: string;
  changeType: string;
  title: string;
  description: string | null;
  diff?: Record<string, { old: unknown; new: unknown }> | null;
  photoUrl?: string | null;
  createdAt: string;
}

export interface UkePermitGroup {
  permitId: string;
  rawPermit: string;
  operator: string;
  revision?: number;
  decisionYear?: number;
  kind: string;
  expires?: string;
  bands: Array<{ tech: string; band: string }>;
}

export interface UkeMilestone {
  badge: string;
  badgeType: 'purple' | 'success' | 'info' | 'warning';
  title: string;
  description: string;
  year?: number;
}

export interface CollocatedStation {
  towerId: string;
  stationId?: string;
  operator: string;
  distanceMeters: number;
}

export interface PemTimelineItem {
  id?: string;
  date: string | null;
  laboratory?: string;
  operator?: string;
  number?: string;
  intensity?: number;
  downloadUrl?: string;
}

export interface StationTimelineCellItem {
  label: string;
  paramLabel: string;
  paramValue: string;
}

export interface StationTimelineCellGroup {
  tech: string;
  count: number;
  cells: StationTimelineCellItem[];
}

export interface StationTimelineDiffItem {
  label: string;
  oldValue?: string;
  newValue: string;
}

export interface StationTimelineEvent {
  id: string;
  dateGroup: string;
  time: string;
  createdAt: string;
  kind: 'location' | 'cells_updated' | 'cells_added' | 'property' | 'comment' | 'photo';
  title: string;
  diffs?: StationTimelineDiffItem[];
  totalCells?: number;
  techCounts?: Array<{ tech: string; count: number }>;
  cellGroups?: StationTimelineCellGroup[];
  description?: string | null;
  photoUrl?: string | null;
  userNick?: string;
}

export interface TowerHistoryData {
  towerId: string;
  stationId: string;
  address: string;
  source: string;
  isBtmap: boolean;
  createdAt: string;
  updatedAt?: string;
  addedBy: string;
  mastType: string | null;
  height: number | null;
  notes: string | null;
  events: StationTimelineEvent[];
  btmap: {
    timeline: TowerHistoryEvent[];
    totalEvents: number;
  };
  uke: {
    lastRevisionYear?: number;
    milestones: UkeMilestone[];
    permits: UkePermitGroup[];
    has5GCBand: boolean;
    has5GDSS: boolean;
    lteBandsCount: number;
    collocated: CollocatedStation[];
  };
  pem: PemTimelineItem[];
}
