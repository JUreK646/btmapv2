import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { getTowers, normalizeTower,withPemCounts } from './query.ts';
import { withAzimuths } from './azimuths.ts';
import {createPemService,towerForPemOperator} from './pem.ts';
import {createPemReportsService} from './pemReports.ts';
import {createPemPlansService} from './pemPlans.ts';
import {createPemPdfService} from './pemCatalog.ts';
import type {createSi2pemSync} from './si2pemSync.ts';
import type {Tower} from '../src/types.ts';
import {validateStationSubmission} from '../shared/cellValidation.ts';
import {calculateTerrainProfile} from './terrainProfile.ts';
import {evaluateAreaCoverage} from './areaEvaluation.ts';

type User = { id: string; email: string; nick: string; role: string; points: number; level: number };
const publicUser = (user: Record<string, unknown>) => ({ id:user.id, email:user.email, nick:user.nick, role:user.role, points:user.points, level:user.level });
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const text = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0,max) : '';

export function createApp(db: DatabaseSync,si2pem?:ReturnType<typeof createSi2pemSync>) {
  const app = express();
  const getPem=createPemService();
  const getPemReports=si2pem?.reports||createPemReportsService(fetch,db);
  const pemPlans=si2pem?.plans||createPemPlansService(db);
  const getPemPdf=createPemPdfService(getPemReports,db);
  app.disable('x-powered-by');
  app.use(express.json({ limit:'100kb' }));
  app.use((req,res,next) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','no-store');
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin) {
      const origin = new URL(req.headers.origin);
      const allowed = [req.headers.host, process.env.PUBLIC_HOST, 'localhost:5173','127.0.0.1:5173','localhost:5174','127.0.0.1:5174','localhost:5175','127.0.0.1:5175','localhost:4173','127.0.0.1:4173'];
      const isLocal = origin.hostname === 'localhost' || origin.hostname === '127.0.0.1';
      if (!allowed.includes(origin.host) && !isLocal) return res.status(403).json({error:'Niedozwolone źródło żądania.'});
    }
    next();
  });
  const sessionToken = (req: Request) => req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('btmap_session='))?.slice(14) || '';
  const currentUser = (req: Request) => db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.userId=u.id WHERE s.token=? AND s.expiresAt>?').get(digest(sessionToken(req)), Date.now()) as (User & Record<string, unknown>) | undefined;
  const requireUser = (req: Request,res: Response,next: NextFunction) => { const user=currentUser(req); if(!user) return res.status(401).json({error:'Zaloguj się, aby kontynuować.'}); res.locals.user=user; next(); };
  const requireAdmin = (req: Request,res: Response,next: NextFunction) => { const user=currentUser(req); if(user?.role!=='ADMIN') return res.status(403).json({error:'Ta sekcja wymaga konta administratora.'}); res.locals.user=user; next(); };
  const log = (nick:string,action:string,target:string) => db.prepare('INSERT INTO logs (id,userNick,action,target,status,createdAt) VALUES (?,?,?,?,?,?)').run(randomUUID(),nick,action,target,'SUCCESS',new Date().toISOString());
  const setSession = (res:Response,id:string) => {
    const token=randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expiresAt<?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token),id,Date.now()+7*86400000);
    res.cookie('btmap_session',token,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',maxAge:7*86400000,path:'/'});
  };
  const attempts = new Map<string,{count:number;until:number}>();
  const rateLimit = (req:Request,res:Response,next:NextFunction) => {
    const key=req.ip || 'local'; const now=Date.now();
    if(attempts.size>1000) for(const [ip,entry] of attempts) if(entry.until<now) attempts.delete(ip);
    let entry=attempts.get(key); if(!entry || entry.until<now) entry={count:0,until:now+600000};
    entry.count++; attempts.set(key,entry);
    if(entry.count>30) return res.status(429).json({error:'Za dużo prób. Spróbuj ponownie za 10 minut.'});
    next();
  };
  app.get('/api/auth/me',(req,res)=>{ const user=currentUser(req); res.json(user?publicUser(user):null); });
  app.post('/api/auth/register',rateLimit,async(req,res)=>{
    const email=text(req.body.email,254).toLowerCase(), nick=text(req.body.nick,40), password=text(req.body.password,128);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || nick.length<2 || password.length<10) return res.status(400).json({error:'Podaj poprawny e-mail, nazwę (min. 2 znaki) i hasło (min. 10 znaków).'});
    if(db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(email)) return res.status(409).json({error:'Ten adres e-mail ma już konto.'});
    if(db.prepare('SELECT id FROM users WHERE nick=? COLLATE NOCASE').get(nick)) return res.status(409).json({error:'Ta nazwa użytkownika jest już zajęta.'});
    const id=randomUUID(), hash=await bcrypt.hash(password,12);
    db.prepare('INSERT INTO users(id,email,nick,password,createdAt) VALUES (?,?,?,?,?)').run(id,email,nick,hash,new Date().toISOString());
    setSession(res,id); res.status(201).json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)!));
  });
  app.post('/api/auth/login',rateLimit,async(req,res)=>{
    const ident=text(req.body.email,254);
    const user=db.prepare('SELECT * FROM users WHERE (email=? OR nick=?) COLLATE NOCASE').get(ident,ident) as Record<string,unknown> | undefined;
    if(!user?.password || !await bcrypt.compare(text(req.body.password,128),String(user.password))) return res.status(401).json({error:'Nieprawidłowy login, e-mail lub hasło.'});
    setSession(res,String(user.id)); res.json(publicUser(user));
  });
  app.post('/api/auth/logout',(req,res)=>{ db.prepare('DELETE FROM sessions WHERE token=?').run(digest(sessionToken(req))); res.clearCookie('btmap_session',{path:'/'}); res.json({ok:true}); });
  let cachedStats: { at:number; data:unknown } | null=null;
  app.get('/api/health',(_req,res)=>{
    if(cachedStats && Date.now()-cachedStats.at<30000) return res.json(cachedStats.data);
    const count=(sql:string)=>Number(db.prepare(sql).get()!.count);
    const operators=db.prepare("SELECT json_extract(op.value,'$.name') AS name,COUNT(*) AS count FROM towers t,json_each(CASE WHEN json_valid(t.operators) THEN t.operators ELSE '[]' END) op WHERE t.status='APPROVED'  GROUP BY name ORDER BY count DESC").all();
    const technologies=db.prepare("SELECT CASE json_extract(b.value,'$.tech') WHEN 'NR' THEN '5G' ELSE json_extract(b.value,'$.tech') END AS name,COUNT(DISTINCT t.id) AS count FROM towers t,json_each(CASE WHEN json_valid(t.operators) THEN t.operators ELSE '[]' END) op,json_each(op.value,'$.bands') b WHERE t.status='APPROVED'  GROUP BY name ORDER BY count DESC").all();
    const provinces=db.prepare("SELECT province AS name,COUNT(*) AS count FROM towers WHERE status='APPROVED'  AND province IS NOT NULL AND province!='' GROUP BY province ORDER BY count DESC").all();
    const metadata=Object.fromEntries(db.prepare('SELECT * FROM metadata').all().map(r=>[r.key,r.value]));
    const btmapTowers=count("SELECT COUNT(*) AS count FROM towers WHERE status='APPROVED' AND source='BTMAP'");
    const ukeTowers=count("SELECT COUNT(*) AS count FROM towers WHERE status='APPROVED' AND source='UKE'");
    const totalTowers=count("SELECT COUNT(*) AS count FROM towers WHERE status='APPROVED'");
    const data={status:'ok',version:'2.0.0',stats:{towers:totalTowers,btmapTowers,ukeTowers,operators,technologies,provinces},metadata};
    cachedStats={at:Date.now(),data}; res.json(data);
  });
  app.get('/api/towers',(req,res)=>{try{res.json(getTowers(db,req.query));}catch(e){res.status(400).json({error:(e as Error).message});}});
  app.get('/api/pem-plans',(req,res)=>{try{res.json(pemPlans.query(req.query));}catch(e){res.status(400).json({error:(e as Error).message});}});
  app.get('/api/terrain-profile', async (req, res) => {
    try {
      const lat1 = Number(req.query.lat1);
      const lng1 = Number(req.query.lng1);
      const lat2 = Number(req.query.lat2);
      const lng2 = Number(req.query.lng2);
      if (!Number.isFinite(lat1) || !Number.isFinite(lng1) || !Number.isFinite(lat2) || !Number.isFinite(lng2)) {
        return res.status(400).json({ error: 'Podaj poprawne współrzędne nadajnika i odbiornika (lat1, lng1, lat2, lng2).' });
      }
      const txHeight = Number(req.query.txHeight) || 35;
      const rxHeight = Number(req.query.rxHeight) || 5;
      const freqMhz = Number(req.query.freq) || 1800;
      const azimuthDeg = req.query.azimuth !== undefined ? Number(req.query.azimuth) : undefined;
      const tiltDeg = req.query.tilt !== undefined ? Number(req.query.tilt) : undefined;
      const samples = Math.min(100, Math.max(10, Number(req.query.samples) || 75));
      const includeSurface = req.query.surface !== '0';

      const result = await calculateTerrainProfile({
        lat1,
        lng1,
        lat2,
        lng2,
        txHeight,
        rxHeight,
        freqMhz,
        azimuthDeg,
        tiltDeg,
        sampleCount: samples,
        includeSurface,
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message || 'Błąd wyliczania profilu terenu.' });
    }
  });
  app.get('/api/area-evaluation', async (req, res) => {
    try {
      const lat = Number(req.query.lat ?? req.query.centerLat);
      const lng = Number(req.query.lng ?? req.query.centerLng);
      const radiusM = req.query.radiusM ? Number(req.query.radiusM) : undefined;
      const areaKm2 = req.query.areaKm2 ? Number(req.query.areaKm2) : undefined;
      const targetName = typeof req.query.targetName === 'string' ? req.query.targetName : undefined;

      const result = await evaluateAreaCoverage(db, {
        centerLat: lat,
        centerLng: lng,
        radiusM,
        areaKm2,
        targetName,
      });
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message || 'Błąd analizy terenu i oceny operatorów.' });
    }
  });
  app.post('/api/area-evaluation', async (req, res) => {
    try {
      const result = await evaluateAreaCoverage(db, req.body);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message || 'Błąd analizy terenu i oceny operatorów.' });
    }
  });
  app.use('/api/towers/:id',(req,res,next)=>{
    if(!db.prepare("SELECT id FROM towers WHERE id=?  AND status='APPROVED'").get(String(req.params.id))) return res.status(404).json({error:'Nie znaleziono stacji w bazie.'});
    next();
  });
  app.get('/api/towers/:id',(req,res)=>{const row=db.prepare("SELECT * FROM towers WHERE id=? AND status='APPROVED' ").get(String(req.params.id)); if(!row)return res.status(404).json({error:'Nie znaleziono stacji.'});res.json(withAzimuths(db,withPemCounts(db,[normalizeTower(row)]))[0]);});
  app.get('/api/towers/:id/pem-reports',async(req,res)=>{
    const row=db.prepare("SELECT * FROM towers WHERE id=? AND status='APPROVED' ").get(String(req.params.id));
    if(!row)return res.status(404).json({error:'Nie znaleziono stacji w bazie.'});
    let tower:Tower;try{tower=towerForPemOperator(normalizeTower(row) as unknown as Tower,typeof req.query.operator==='string'?req.query.operator:undefined);}
    catch(e){return res.status(400).json({error:(e as Error).message});}
    try{res.json(await getPemReports(tower,req.query.refresh==='1'));}
    catch{res.status(502).json({error:'Nie udało się wczytać raportów SI2PEM. Spróbuj ponownie.'});}
  });
  app.get('/api/towers/:id/pem-reports/:reportId/pdf',async(req,res)=>{
    if(!/^[a-f0-9]{24}$/.test(String(req.params.reportId)))return res.status(404).json({error:'Nie znaleziono raportu.'});
    const row=db.prepare("SELECT * FROM towers WHERE id=? AND status='APPROVED' ").get(String(req.params.id));
    if(!row)return res.status(404).json({error:'Nie znaleziono stacji w bazie.'});
    let tower:Tower;try{tower=towerForPemOperator(normalizeTower(row) as unknown as Tower,typeof req.query.operator==='string'?req.query.operator:undefined);}
    catch(e){return res.status(400).json({error:(e as Error).message});}
    try{res.json(await getPemPdf(tower,String(req.params.reportId)));}
    catch{res.status(502).json({error:'Nie udało się odczytać tego PDF. Możesz otworzyć dokument źródłowy w przeglądarce.'});}
  });
  app.get('/api/towers/:id/pem',async(req,res)=>{
    const row=db.prepare("SELECT * FROM towers WHERE id=? AND status='APPROVED' ").get(String(req.params.id));
    if(!row)return res.status(404).json({error:'Nie znaleziono stacji w bazie.'});
    try{res.json(await getPem(normalizeTower(row) as unknown as Tower));}
    catch{res.status(502).json({error:'Nie udało się pobrać pomiarów SI2PEM. Spróbuj ponownie lub otwórz mapę SI2PEM.'});}
  });
  app.get('/api/radiolines',(req,res)=>{
    const bounds=['minLat','maxLat','minLng','maxLng'].map(k=>Number(req.query[k]));
    if(bounds.some(x=>!Number.isFinite(x))) return res.status(400).json({error:'Wybierz obszar mapy.'});
    res.json(db.prepare('SELECT * FROM radiolines WHERE (latA BETWEEN ? AND ? AND lngA BETWEEN ? AND ?) OR (latB BETWEEN ? AND ? AND lngB BETWEEN ? AND ?) LIMIT 1500').all(...bounds,...bounds));
  });
  app.get('/api/towers/:id/comments',(req,res)=>res.json(db.prepare('SELECT * FROM comments WHERE towerId=? ORDER BY createdAt DESC LIMIT 200').all(String(req.params.id))));
  app.post('/api/towers/:id/comments',requireUser,(req,res)=>{
    const message=text(req.body.text,2000), id=randomUUID();
    if(!message) return res.status(400).json({error:'Wpisz treść komentarza.'});
    if(!db.prepare("SELECT id FROM towers WHERE id=? ").get(String(req.params.id)))return res.status(404).json({error:'Nie znaleziono stacji.'});
    const comment={id,towerId:String(req.params.id),userNick:res.locals.user.nick,text:message,createdAt:new Date().toISOString()};
    db.prepare('INSERT INTO comments VALUES (?,?,?,?,?)').run(...Object.values(comment));res.status(201).json(comment);
  });
  app.get('/api/towers/:id/photos',(req,res)=>res.json(db.prepare('SELECT * FROM photos WHERE towerId=? ORDER BY createdAt DESC').all(String(req.params.id))));
  app.post('/api/submit',requireUser,(req,res)=>{
    const type=req.body.type, data=req.body.data || {};
    if(type==='NEW_STATION'){
      const validation=validateStationSubmission({
        operator:text(data.operator,50),
        stationId:text(data.stationId,50),
        address:text(data.address,300),
        province:text(data.province,50),
        lat:Number(data.lat),
        lng:Number(data.lng),
        mastType:text(data.mastType,100),
        owner:text(data.owner,100),
        height:Number(data.height)||undefined,
        notes:text(data.notes,2000),
        azimuths:Array.isArray(data.azimuths)?data.azimuths.map(Number):[],
        technologies:Array.isArray(data.technologies)?data.technologies:[],
        cells:Array.isArray(data.cells)?data.cells:[],
      });
      if(!validation.valid){
        const firstErr=Object.values(validation.stationErrors)[0]||
          Object.values(validation.cellErrors).flatMap(e=>Object.values(e))[0]||
          'Formularz zawiera błędy walidacji.';
        return res.status(400).json({error:firstErr,details:validation});
      }
      const clean={
        operator:text(data.operator,50),
        stationId:text(data.stationId,50),
        address:text(data.address,300),
        province:text(data.province,50),
        lat:Number(data.lat),
        lng:Number(data.lng),
        mastType:text(data.mastType,100),
        owner:text(data.owner,100),
        height:Number(data.height)||null,
        notes:text(data.notes,2000),
        azimuths:Array.isArray(data.azimuths)?data.azimuths.map(Number):[],
        technologies:Array.isArray(data.technologies)?data.technologies:[],
        cells:data.cells,
        sourceTowerId:text(data.sourceTowerId,200)||null,
      };
      const id=randomUUID();
      if (res.locals.user.role === 'ADMIN') {
        const newId = clean.sourceTowerId ? ('BTMAP_' + clean.sourceTowerId.replace(/^UKE_/, '')) : ('BTMAP_' + randomUUID().slice(0, 12));
        const ops = [{
          name: clean.operator,
          stationIds: clean.stationId ? [clean.stationId] : [],
          bands: Array.isArray(clean.cells) ? clean.cells.map((c: any) => ({
            tech: c.tech,
            band: c.band,
            pci: c.pci,
            earfcn: c.earfcn,
            azimuth: c.azimuth
          })) : []
        }];
        db.prepare(`
          INSERT INTO towers (
            id, stationId, address, province, lat, lng, operators,
            mastType, owner, height, notes, source, addedBy, status, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BTMAP', ?, 'APPROVED', ?)
          ON CONFLICT(id) DO UPDATE SET
            stationId = excluded.stationId,
            address = excluded.address,
            province = excluded.province,
            lat = excluded.lat,
            lng = excluded.lng,
            operators = excluded.operators,
            mastType = excluded.mastType,
            owner = excluded.owner,
            height = excluded.height,
            notes = excluded.notes,
            source = 'BTMAP'
        `).run(
          newId,
          clean.stationId || null,
          clean.address || '',
          clean.province || '',
          clean.lat,
          clean.lng,
          JSON.stringify(ops),
          clean.mastType || null,
          clean.owner || null,
          clean.height || null,
          clean.notes || null,
          res.locals.user.nick || 'BTMAP',
          new Date().toISOString()
        );
        db.prepare('INSERT INTO queue(id,type,data,userNick,createdAt,userId,status) VALUES(?,?,?,?,?,?,?)').run(id,'NEW_STATION',JSON.stringify(clean),res.locals.user.nick,new Date().toISOString(),res.locals.user.id,'APPROVED');
        log(res.locals.user.nick,'NOWA_STACJA_AUTO_APPROVE',id);
        cachedStats=null;
        return res.status(201).json({id,status:'APPROVED',towerId:newId});
      }
      db.prepare('INSERT INTO queue(id,type,data,userNick,createdAt,userId) VALUES(?,?,?,?,?,?)').run(id,'NEW_STATION',JSON.stringify(clean),res.locals.user.nick,new Date().toISOString(),res.locals.user.id);
      log(res.locals.user.nick,'NOWA_STACJA',id);
      return res.status(201).json({id,status:'PENDING'});
    }
    if(type!=='REPORT') return res.status(400).json({error:'Nieobsługiwany typ zgłoszenia.'});
    const towerId=text(data.towerId,200), notes=text(data.notes,2000), category=text(data.category,40);
    const tower=db.prepare("SELECT * FROM towers WHERE id=?  AND status='APPROVED'").get(towerId);
    if(!tower) return res.status(404).json({error:'Nie znaleziono stacji w bazie.'});
    if(notes.length<10) return res.status(400).json({error:'Opisz problem w co najmniej 10 znakach.'});
    if(!['location','bands','other'].includes(category)) return res.status(400).json({error:'Wybierz rodzaj uwagi.'});
    const clean={towerId,notes,category,address:tower.address,lat:tower.lat,lng:tower.lng,operators:JSON.parse(String(tower.operators||'[]'))};
    const id=randomUUID(); db.prepare('INSERT INTO queue(id,type,data,userNick,createdAt,userId) VALUES(?,?,?,?,?,?)').run(id,type,JSON.stringify(clean),res.locals.user.nick,new Date().toISOString(),res.locals.user.id);
    log(res.locals.user.nick,'ZGŁOSZENIE',id);res.status(201).json({id,status:'PENDING'});
  });
  app.get('/api/my/submissions',requireUser,(_req,res)=>res.json(db.prepare('SELECT id,type,status,createdAt FROM queue WHERE userId=? ORDER BY createdAt DESC').all(res.locals.user.id)));
  app.use('/api/admin',requireAdmin);
  app.get('/api/admin/queue',(_req,res)=>res.json(db.prepare("SELECT * FROM queue WHERE status='PENDING' ORDER BY createdAt").all().map(r=>({...r,data:JSON.parse(String(r.data))}))));
  app.get('/api/admin/users',(_req,res)=>res.json(db.prepare('SELECT id,email,nick,role,points,createdAt FROM users ORDER BY createdAt DESC').all()));
  app.get('/api/admin/logs',(_req,res)=>res.json(db.prepare('SELECT * FROM logs ORDER BY createdAt DESC LIMIT 100').all()));
  app.post('/api/admin/moderate',(req,res)=>{
    const item=db.prepare("SELECT * FROM queue WHERE id=? AND status='PENDING'").get(text(req.body.id,200));
    if(!item)return res.status(404).json({error:'Zgłoszenie jest już rozpatrzone lub nie istnieje.'});
    if(!['APPROVE','REJECT'].includes(req.body.action))return res.status(400).json({error:'Nieprawidłowa decyzja.'});
    db.exec('BEGIN');
    try {
      // Reviewing a report never changes UKE permit data or creates community stations.
      if(req.body.action==='APPROVE'){
        if(item.type==='TOWER') throw new Error('Starsze zgłoszenie nie jest już obsługiwane.');
        if(item.type==='NEW_STATION'){
          const stData=JSON.parse(String(item.data));
          if(stData.sourceTowerId){
            db.prepare('UPDATE towers SET mastType=COALESCE(?, mastType), owner=COALESCE(?, owner), notes=COALESCE(?, notes) WHERE id=?').run(stData.mastType||null, stData.owner||null, stData.notes||null, stData.sourceTowerId);
          }
          if(item.userId){
            db.prepare('UPDATE users SET points=points+10 WHERE id=?').run(item.userId);
          }
        }
      }
      db.prepare('UPDATE queue SET status=? WHERE id=?').run(req.body.action==='APPROVE'?'APPROVED':'REJECTED',item.id);
      log(res.locals.user.nick,req.body.action,String(item.id));db.exec('COMMIT');cachedStats=null;res.json({ok:true});
    } catch(e){db.exec('ROLLBACK');res.status(400).json({error:(e as Error).message});}
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'Nie znaleziono tej funkcji API.'}));
  app.use((error:Error,_req:Request,res:Response,_next:NextFunction)=>{console.error(error.message);res.status(500).json({error:'Nie udało się wykonać operacji. Spróbuj ponownie.'});});
  return app;
}
