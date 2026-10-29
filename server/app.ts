import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
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
import {getTelecomStats, invalidateStatsCache} from './stats.ts';
import {getTowerHistory, recordTowerChange} from './towerHistory.ts';

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
  app.use(express.json({ limit: '15mb' }));
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
    const data={status:'ok',version:'2.0.1',stats:{towers:totalTowers,btmapTowers,ukeTowers,operators,technologies,provinces},metadata};
    cachedStats={at:Date.now(),data}; res.json(data);
  });
  app.get('/api/stats', (req, res) => {
    try {
      const source = typeof req.query.source === 'string' ? req.query.source : 'ALL';
      const stats = getTelecomStats(db, source);
      res.json(stats);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message || 'Błąd pobierania statystyk.' });
    }
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
  // Static WebP photo uploads serving
  app.get('/api/uploads/:filename', (req, res) => {
    const filename = basename(String(req.params.filename));
    if (!/^[a-zA-Z0-9_-]+\.webp$/.test(filename)) {
      return res.status(400).json({ error: 'Nieprawidłowa nazwa pliku.' });
    }
    const filePath = resolve(process.cwd(), 'data', 'uploads', filename);
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Nie znaleziono pliku.' });
    }
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(filePath);
  });

  // Station History & UKE Radio Evolution Timeline
  app.get('/api/towers/:id/history', (req, res) => {
    const history = getTowerHistory(db, String(req.params.id));
    if (!history) return res.status(404).json({ error: 'Nie znaleziono stacji w bazie.' });
    res.json(history);
  });

  // Station Comments & Field Photos
  app.get('/api/towers/:id/comments', (req, res) => {
    const comments = db.prepare('SELECT * FROM comments WHERE towerId=? ORDER BY createdAt DESC LIMIT 200').all(String(req.params.id));
    res.json(comments);
  });

  app.post('/api/towers/:id/comments', requireUser, async (req, res) => {
    try {
      const towerId = String(req.params.id);
      const tower = db.prepare('SELECT id, source FROM towers WHERE id=?').get(towerId) as { id: string; source: string } | undefined;
      if (!tower) return res.status(404).json({ error: 'Nie znaleziono stacji.' });

      // Only allow comments on stations added to our BTMap database (not raw UKE permits)
      const isBtmap = tower.source === 'BTMAP' || tower.source === 'User';
      if (!isBtmap) {
        return res.status(403).json({
          error: 'Komentarze i zdjęcia można dodawać wyłącznie do stacji w bazie BTMap. Stacje z surowego rejestru UKE nie obsługują komentarzy.'
        });
      }

      const message = text(req.body.text, 2000);
      const imageBase64 = typeof req.body.imageBase64 === 'string' ? req.body.imageBase64.trim() : '';

      if (!message && !imageBase64) {
        return res.status(400).json({ error: 'Wpisz treść komentarza lub dołącz zdjęcie.' });
      }

      let photoUrl: string | null = null;
      if (imageBase64) {
        const match = imageBase64.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/);
        const rawData = match ? match[1] : imageBase64;
        const buffer = Buffer.from(rawData, 'base64');

        if (buffer.length > 15 * 1024 * 1024) {
          return res.status(400).json({ error: 'Zdjęcie przekracza dopuszczalny rozmiar 15 MB.' });
        }

        const photoId = randomUUID();
        const uploadsDir = resolve(process.cwd(), 'data', 'uploads');
        if (!existsSync(uploadsDir)) {
          mkdirSync(uploadsDir, { recursive: true });
        }
        const filename = `${photoId}.webp`;
        const filePath = resolve(uploadsDir, filename);

        // Auto-orient based on EXIF, downscale large phone camera resolutions, and compress to crisp WebP
        await sharp(buffer)
          .rotate()
          .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82, effort: 4 })
          .toFile(filePath);

        photoUrl = `/api/uploads/${filename}`;
        db.prepare('INSERT INTO photos (id, towerId, userNick, url, caption, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
          .run(photoId, towerId, res.locals.user.nick, photoUrl, message || null, new Date().toISOString());
      }

      const commentId = randomUUID();
      const createdAt = new Date().toISOString();
      db.prepare('INSERT INTO comments (id, towerId, userNick, text, photoUrl, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
        .run(commentId, towerId, res.locals.user.nick, message, photoUrl, createdAt);

      // Award points (+15 for photo, +5 for text comment)
      const points = photoUrl ? 15 : 5;
      db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(points, res.locals.user.id);

      const comment = {
        id: commentId,
        towerId,
        userNick: res.locals.user.nick,
        text: message,
        photoUrl,
        createdAt,
      };
      res.status(201).json(comment);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Wystąpił błąd podczas dodawania komentarza.' });
    }
  });

  app.delete('/api/towers/:towerId/comments/:commentId', requireUser, (req, res) => {
    const comment = db.prepare('SELECT * FROM comments WHERE id=? AND towerId=?').get(String(req.params.commentId), String(req.params.towerId)) as { id: string; userNick: string; photoUrl?: string } | undefined;
    if (!comment) return res.status(404).json({ error: 'Nie znaleziono komentarza.' });
    const isAuthor = comment.userNick === res.locals.user.nick;
    const isAdmin = res.locals.user.role === 'ADMIN';
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: 'Brak uprawnień do usunięcia tego komentarza.' });
    }
    db.prepare('DELETE FROM comments WHERE id=?').run(comment.id);
    if (comment.photoUrl) {
      const fn = basename(comment.photoUrl);
      const fp = resolve(process.cwd(), 'data', 'uploads', fn);
      if (existsSync(fp)) {
        try { unlinkSync(fp); } catch {}
      }
      db.prepare('DELETE FROM photos WHERE url=?').run(comment.photoUrl);
    }
    res.json({ success: true, message: 'Komentarz został usunięty.' });
  });

  app.get('/api/towers/:id/photos', (req, res) => res.json(db.prepare('SELECT * FROM photos WHERE towerId=? ORDER BY createdAt DESC').all(String(req.params.id))));
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
        recordTowerChange(db, {
          towerId: newId,
          userNick: res.locals.user.nick || 'BTMAP',
          changeType: clean.sourceTowerId ? 'UPDATED' : 'CREATED',
          title: clean.sourceTowerId ? 'Weryfikacja parametrów stacji w BTMap' : 'Utworzenie stacji w bazie BTMap',
          description: clean.notes || 'Zaktualizowano dane stacji w bazie BTMap.',
          diff: {
            mastType: { old: null, new: clean.mastType || null },
            height: { old: null, new: clean.height || null },
            owner: { old: null, new: clean.owner || null }
          }
        });
        log(res.locals.user.nick,'NOWA_STACJA_AUTO_APPROVE',id);
        cachedStats=null; invalidateStatsCache();
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
            db.prepare('UPDATE towers SET mastType=COALESCE(?, mastType), owner=COALESCE(?, owner), notes=COALESCE(?, notes), source="BTMAP" WHERE id=?').run(stData.mastType||null, stData.owner||null, stData.notes||null, stData.sourceTowerId);
            recordTowerChange(db, {
              towerId: stData.sourceTowerId,
              userNick: String(item.userNick || 'Moderator'),
              changeType: 'UPDATED',
              title: 'Zatwierdzenie aktualizacji stacji przez moderatora',
              description: stData.notes || 'Zaktualizowano parametry stacji w bazie BTMap.',
              diff: {
                mastType: { old: null, new: stData.mastType || null },
                owner: { old: null, new: stData.owner || null }
              }
            });
          }
          if(item.userId){
            db.prepare('UPDATE users SET points=points+10 WHERE id=?').run(item.userId);
          }
        }
      }
      db.prepare('UPDATE queue SET status=? WHERE id=?').run(req.body.action==='APPROVE'?'APPROVED':'REJECTED',item.id);
      log(res.locals.user.nick,req.body.action,String(item.id));db.exec('COMMIT');cachedStats=null;invalidateStatsCache();res.json({ok:true});
    } catch(e){db.exec('ROLLBACK');res.status(400).json({error:(e as Error).message});}
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'Nie znaleziono tej funkcji API.'}));
  app.use((error:Error,_req:Request,res:Response,_next:NextFunction)=>{console.error(error.message);res.status(500).json({error:'Nie udało się wykonać operacji. Spróbuj ponownie.'});});
  return app;
}
