import type {DatabaseSync} from 'node:sqlite';
import type {Tower} from '../src/types.ts';
import {SI2PEM_REFRESH_MS} from '../shared/pemPlans.ts';
import {createPemPlansService,prunePlans} from './pemPlans.ts';
import {createPemReportsService} from './pemReports.ts';

export function createSi2pemSync(db:DatabaseSync,fetcher:typeof fetch=fetch){
  const plans=createPemPlansService(db,fetcher),reports=createPemReportsService(fetcher,db);
  let timer:ReturnType<typeof setInterval>|undefined,running:Promise<void>|null=null,stopped=false,lastReportAttempt=0;
  async function run(){
    if(stopped||running)return running;
    running=(async()=>{
      try {
      prunePlans(db);
      if(plans.due())try{
        console.log(`[SI2PEM Sync] Odświeżanie harmonogramu pomiarów SI2PEM (co ${SI2PEM_REFRESH_MS/3600000} h)...`);
        await plans.sync();
      }catch(e){console.error('SI2PEM: synchronizacja harmonogramu nie powiodła się.',(e as Error).message);}
      if(Date.now()-lastReportAttempt<15*60000)return;
      lastReportAttempt=Date.now();
      const due=db.prepare("SELECT tower FROM pem_reports_cache WHERE checkedAt<=? AND CASE WHEN json_valid(tower) THEN json_array_length(tower,'$.operators') ELSE 0 END<=1 ORDER BY checkedAt LIMIT 20").all(Date.now()-SI2PEM_REFRESH_MS);
      for(const row of due){
        if(stopped)break;
        try{await reports(JSON.parse(String(row.tower)) as Tower,true);}catch{console.error('SI2PEM: nie udało się odświeżyć zapisanego raportu stacji.');}
      }
      } catch (err) {
        console.error('SI2PEM: błąd cyklu synchronizacji:', (err as Error).message);
      }
    })().finally(()=>{running=null;});
    return running;
  }
  return {
    plans,
    reports,
    start(){
      stopped=false;
      void run();
      timer=setInterval(()=>void run(),60000);
      timer.unref();
      console.log(`[SI2PEM Sync] Usługa odświeżania pomiarów SI2PEM została uruchomiona (harmonogram co ${SI2PEM_REFRESH_MS/3600000} h, sprawdzanie co minutę).`);
    },
    async stop(){
      stopped=true;
      if(timer)clearInterval(timer);
      await running;
    },
    async syncNow(force=false){
      if(force){
        db.prepare("DELETE FROM metadata WHERE key IN ('pemPlansCheckedAt','pemPlansAttemptAt')").run();
      }
      return run();
    },
    /**
     * Downloads the measurement schedule now and reports the outcome to the caller: unlike the
     * background cycle, a failure is thrown instead of only being logged.
     * Returns false when the saved schedule is still fresh and `force` was not given.
     */
    async syncPlans(force=false){
      if(!force&&!plans.due())return false;
      await plans.sync();
      return true;
    }
  };
}
