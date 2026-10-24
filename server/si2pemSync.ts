import type {DatabaseSync} from 'node:sqlite';
import type {Tower} from '../src/types.ts';
import {SI2PEM_REFRESH_MS} from '../shared/pemPlans.ts';
import {createPemPlansService,prunePlans} from './pemPlans.ts';
import {createPemReportsService} from './pemReports.ts';

export function createSi2pemSync(db:DatabaseSync){
  const plans=createPemPlansService(db),reports=createPemReportsService(fetch,db);
  let timer:ReturnType<typeof setInterval>|undefined,running:Promise<void>|null=null,stopped=false,lastReportAttempt=0;
  async function run(){
    if(stopped||running)return running;
    running=(async()=>{
      prunePlans(db);
      if(plans.due())try{
        console.log('[SI2PEM Sync] Rozpoczynanie cyklicznego odświeżania harmonogramu SI2PEM (co 2h)...');
        await plans.sync();
      }catch(e){console.error('SI2PEM: synchronizacja harmonogramu nie powiodła się.',(e as Error).message);}
      if(Date.now()-lastReportAttempt<15*60000)return;
      lastReportAttempt=Date.now();
      const due=db.prepare("SELECT tower FROM pem_reports_cache WHERE checkedAt<=? AND CASE WHEN json_valid(tower) THEN json_array_length(tower,'$.operators') ELSE 0 END<=1 ORDER BY checkedAt LIMIT 20").all(Date.now()-SI2PEM_REFRESH_MS);
      for(const row of due){
        if(stopped)break;
        try{await reports(JSON.parse(String(row.tower)) as Tower,true);}catch{console.error('SI2PEM: nie udało się odświeżyć zapisanego raportu stacji.');}
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
      console.log('[SI2PEM Sync] Usługa automatycznego odświeżania pomiarów SI2PEM co 2h została uruchomiona.');
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
    }
  };
}
