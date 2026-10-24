export const SI2PEM_REFRESH_MS=2*60*60*1000;
export interface PemPlan {
  id:string;stationId:string;operator:string;operatorName:string;lab:string;accreditation:string;
  address:string;city:string;province:string;lat:number;lng:number;
  dateFrom:string;dateTo:string;status:'PLANNED'|'COMPLETED';reportUrl:string|null;
}
export interface PemPlansResult {
  items:PemPlan[];total:number;limit:number;hasMore:boolean;
  checkedAt:string|null;nextRefreshAt:string|null;stale:boolean;error:string|null;
}
