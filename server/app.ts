import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync, existsSync, unlinkSync, readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { getNewEntryWindow, getTowers, normalizeTower,withPemCounts } from './query.ts';
import { withAzimuths } from './azimuths.ts';
import {createPemService,towerForPemOperator} from './pem.ts';
import {createPemReportsService} from './pemReports.ts';
import {createPemPlansService} from './pemPlans.ts';
import {createPemPdfService} from './pemCatalog.ts';
import type {createSi2pemSync} from './si2pemSync.ts';
import type {Tower} from '../src/types.ts';
import {validateStationSubmission} from '../shared/cellValidation.ts';
import { MAP_RADIOLINE_LIMIT } from '../shared/mapLimits.ts';
import { MAX_JSON_BODY_BYTES, MAX_PHOTO_BODY_BYTES, MAX_PHOTO_BYTES } from '../shared/uploadLimits.ts';
import {calculateTerrainProfile, TerrainDataUnavailableError} from './terrainProfile.ts';
import {evaluateAreaCoverage} from './areaEvaluation.ts';
import {getTelecomStats, invalidateStatsCache, warmStatsCache} from './stats.ts';
import {getTowerHistory, recordTowerChange} from './towerHistory.ts';
import {getKmzCatalog, generateKmzArchive} from './kmzExport.ts';

type User = { id: string; email: string; nick: string; role: string; points: number; level: number };
const publicUser = (user: Record<string, unknown>) => ({ id:user.id, email:user.email, nick:user.nick, role:user.role, points:user.points, level:user.level });
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const text = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0,max) : '';
/** The released version, read from package.json so it is stated in one place. */
const APP_VERSION = (() => {
  try { return String(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version || 'unknown'); }
  catch { return 'unknown'; }
})();
/**
 * Answers 500 with a fixed message. The underlying error goes to the server log only: its text can
 * contain SQL, file paths or upstream URLs that are of no use to a visitor.
 */
const serverError = (res: Response, error: unknown, message: string) => {
  console.error(`[API] ${message}`, error);
  res.status(500).json({ error: message });
};
/** Optional numeric cell field: a finite number, or undefined so it is left out of the stored record. */
const cellNumber = (value: unknown) => value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(Number(value)) ? undefined : Number(value);

export function createApp(
  db: DatabaseSync,
  si2pem?: ReturnType<typeof createSi2pemSync>,
  { trustProxy = process.env.TRUST_PROXY }: { trustProxy?: string } = {},
) {
  const app = express();
  // Behind a reverse proxy req.ip is the proxy itself, so every visitor would share one rate-limit bucket.
  // TRUST_PROXY is the number of proxies in front of the API (1 for the bundled nginx) or an Express
  // "trust proxy" value such as "loopback". Leave it unset when the API is reachable directly:
  // otherwise clients could forge X-Forwarded-For and dodge the limit.
  if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === 'true' ? true : trustProxy);
  const getPem=createPemService();
  const getPemReports=si2pem?.reports||createPemReportsService(fetch,db);
  const pemPlans=si2pem?.plans||createPemPlansService(db);
  const getPemPdf=createPemPdfService(getPemReports,db);
  app.disable('x-powered-by');
  // Only the photo comment endpoint accepts large bodies; everything else stays small.
  const jsonBody = express.json({ limit: MAX_JSON_BODY_BYTES });
  const photoBody = express.json({ limit: MAX_PHOTO_BODY_BYTES });
  app.use((req, res, next) => (/^\/api\/towers\/[^/]+\/comments\/?$/.test(req.path) ? photoBody : jsonBody)(req, res, next));
  app.use((req,res,next) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','no-store');
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin) {
      // "null" (sandboxed pages, some redirects) and other unparsable values are simply not an allowed origin.
      let origin: URL;
      try { origin = new URL(req.headers.origin); } catch { return res.status(403).json({error:'Niedozwolone źródło żądania.'}); }
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
  // Fixed-window limiter. Each use has its own counters; the key is the client IP unless a route keys by account.
  const limiter = (max:number,windowMs:number,keyOf:(req:Request,res:Response)=>string=req=>req.ip || 'local') => {
    const attempts = new Map<string,{count:number;until:number}>();
    return (req:Request,res:Response,next:NextFunction) => {
      const key=keyOf(req,res); const now=Date.now();
      if(attempts.size>1000) for(const [id,entry] of attempts) if(entry.until<now) attempts.delete(id);
      let entry=attempts.get(key); if(!entry || entry.until<now) entry={count:0,until:now+windowMs};
      entry.count++; attempts.set(key,entry);
      if(entry.count>max) return res.status(429).json({error:`Za dużo prób. Spróbuj ponownie za ${Math.max(1,Math.ceil((entry.until-now)/60000))} min.`});
      next();
    };
  };
  const byAccount = (req:Request,res:Response) => String(res.locals.user?.id || req.ip || 'local');
  const rateLimit = limiter(30,600000);
  // Comments award points and store photos; submissions fill the moderation queue.
  const commentLimit = limiter(20,600000,byAccount);
  const submitLimit = limiter(30,3600000,byAccount);
  // These call external elevation services for every request.
  const terrainLimit = limiter(120,600000);
  const areaLimit = limiter(30,600000);
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
    // The isNew column is added by the radioline sync, so a database that never synced has none.
    let radiolines={total:0,new:0};
    try{const row=db.prepare('SELECT COUNT(*) AS total,COALESCE(SUM(isNew),0) AS fresh FROM radiolines').get()!;radiolines={total:Number(row.total),new:Number(row.fresh)};}
    catch{radiolines={total:count('SELECT COUNT(*) AS count FROM radiolines'),new:0};}
    const data={status:'ok',version:APP_VERSION,stats:{towers:totalTowers,btmapTowers,ukeTowers,operators,technologies,provinces,radiolines},metadata,newEntries:getNewEntryWindow(db)};
    cachedStats={at:Date.now(),data}; res.json(data);
  });
  app.get('/api/stats', (req, res) => {
    try {
      const source = typeof req.query.source === 'string' ? req.query.source : 'ALL';
      const stats = getTelecomStats(db, source);
      res.json(stats);
    } catch (e) {
      serverError(res, e, 'Błąd pobierania statystyk.');
    }
  });
  app.get('/api/kmz/catalog', (req, res) => {
    try {
      const type = typeof req.query.type === 'string' ? req.query.type : 'stations';
      const source = typeof req.query.source === 'string' ? req.query.source : 'ALL';
      res.json(getKmzCatalog(db, { type, source }));
    } catch (e) {
      serverError(res, e, 'Błąd generowania katalogu KMZ.');
    }
  });
  app.get('/api/kmz/download', (req, res) => {
    try {
      const type = typeof req.query.type === 'string' ? req.query.type : 'stations';
      const source = typeof req.query.source === 'string' ? req.query.source : 'ALL';
      const scope = typeof req.query.scope === 'string' ? req.query.scope : 'all';
      const province = typeof req.query.province === 'string' ? req.query.province : '';
      const { buffer, filename } = generateKmzArchive(db, { type, source, scope, province });
      res.setHeader('Content-Type', 'application/vnd.google-earth.kmz');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', String(buffer.length));
      res.send(buffer);
    } catch (e) {
      serverError(res, e, 'Błąd generowania pliku KMZ.');
    }
  });
  app.get('/api/towers',(req,res)=>{try{res.json(getTowers(db,req.query));}catch(e){res.status(400).json({error:(e as Error).message});}});
  app.get('/api/pem-plans',(req,res)=>{try{res.json(pemPlans.query(req.query));}catch(e){res.status(400).json({error:(e as Error).message});}});
  app.get('/api/terrain-profile', terrainLimit, async (req, res) => {
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
      // No elevation data is an upstream outage, reported as such instead of a profile over invented terrain.
      if (e instanceof TerrainDataUnavailableError) return res.status(502).json({ error: e.message });
      serverError(res, e, 'Błąd wyliczania profilu terenu.');
    }
  });
  app.get('/api/area-evaluation', areaLimit, async (req, res) => {
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
  app.post('/api/area-evaluation', areaLimit, async (req, res) => {
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
  app.get('/api/towers/:id',(req,res)=>{const row=db.prepare("SELECT * FROM towers WHERE id=? AND status='APPROVED' ").get(String(req.params.id)); if(!row)return res.status(404).json({error:'Nie znaleziono stacji.'});res.json(withAzimuths(db,withPemCounts(db,[normalizeTower(row,getNewEntryWindow(db))]))[0]);});
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
  app.get('/api/radiolines', (req, res) => {
    const onlyNew = req.query.onlyNew === '1' || req.query.onlyNew === 'true';
    const rawBounds = ['minLat', 'maxLat', 'minLng', 'maxLng'].map(k => req.query[k] !== undefined ? Number(req.query[k]) : NaN);
    const hasBounds = rawBounds.every(x => Number.isFinite(x));

    if (!hasBounds && !onlyNew) return res.status(400).json({ error: 'Wybierz obszar mapy.' });
    const rawOperators = typeof req.query.operators === 'string' ? req.query.operators : '';
    const operators = rawOperators ? rawOperators.split(',').map(s => s.trim()).filter(Boolean) : [];

    let sql = 'SELECT * FROM radiolines WHERE 1=1';
    const params: (number | string)[] = [];

    if (hasBounds) {
      sql += ' AND ((latA BETWEEN ? AND ? AND lngA BETWEEN ? AND ?) OR (latB BETWEEN ? AND ? AND lngB BETWEEN ? AND ?))';
      params.push(...rawBounds, ...rawBounds);
    }

    if (onlyNew) {
      sql += ' AND isNew = 1';
    }

    if (operators.length > 0) {
      sql += ` AND operator IN (${operators.map(() => '?').join(',')})`;
      params.push(...operators);
    }
    const radiolineLimit = Math.min(MAP_RADIOLINE_LIMIT, 1000);
    sql += ` LIMIT ${radiolineLimit}`;
    return res.json(db.prepare(sql).all(...params));
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

  app.post('/api/towers/:id/comments', requireUser, commentLimit, async (req, res) => {
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

        if (buffer.length > MAX_PHOTO_BYTES) {
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
        try {
          await sharp(buffer)
            .rotate()
            .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82, effort: 4 })
            .toFile(filePath);
        } catch {
          // Not an image, or a format the decoder cannot read: the sender's problem, not a server fault.
          try { unlinkSync(filePath); } catch { /* nothing was written */ }
          return res.status(400).json({ error: 'Nie udało się odczytać zdjęcia. Użyj pliku JPG, PNG lub WebP.' });
        }

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
      serverError(res, err, 'Wystąpił błąd podczas dodawania komentarza.');
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
  type StationData = {
    operator: string; stationId: string; address: string; province: string; lat: number; lng: number;
    mastType: string; owner: string; height: number | null; notes: string; cells: unknown; sourceTowerId: string | null;
  };
  // Publishes a reviewed station as a BTMap record. The UKE permit row it was based on is never modified.
  const publishStation = (clean: StationData, userNick: string, titles: { updated: string; created: string }) => {
    if (!clean.operator || !Number.isFinite(clean.lat) || !Number.isFinite(clean.lng)) {
      throw new Error('Zgłoszenie nie zawiera operatora lub poprawnych współrzędnych stacji.');
    }
    const newId = clean.sourceTowerId ? ('BTMAP_' + clean.sourceTowerId.replace(/^UKE_/, '')) : ('BTMAP_' + randomUUID().slice(0, 12));
    const ops = [{
      name: clean.operator,
      stationIds: clean.stationId ? [clean.stationId] : [],
      bands: Array.isArray(clean.cells) ? clean.cells.map((c: any) => ({
        tech: c.tech,
        band: c.band,
        pci: c.pci,
        earfcn: c.earfcn,
        azimuth: c.azimuth,
        // Stored only as entered: a 5G cell without a mode is not assumed to be NSA.
        mode: c.tech === '5G' && (c.mode === 'NSA' || c.mode === 'SA') ? c.mode : undefined,
        isIot: Boolean(c.isIot),
        cellType: c.cellType || 'macro',
        // Cell identity reported from the field. Without these a published station cannot be found by eNB/gNB or cell id.
        nodeId: cellNumber(c.nodeId),
        cellId: cellNumber(c.cellId),
        lac: cellNumber(c.lac),
        tac: cellNumber(c.tac),
        rnc: cellNumber(c.rnc),
        bsic: cellNumber(c.bsic),
        bandwidth: cellNumber(c.bandwidth),
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
      userNick,
      new Date().toISOString()
    );
    recordTowerChange(db, {
      towerId: newId,
      userNick,
      changeType: clean.sourceTowerId ? 'UPDATED' : 'CREATED',
      title: clean.sourceTowerId ? titles.updated : titles.created,
      description: clean.notes || 'Zaktualizowano dane stacji w bazie BTMap.',
      diff: {
        mastType: { old: null, new: clean.mastType || null },
        height: { old: null, new: clean.height || null },
        owner: { old: null, new: clean.owner || null }
      }
    });
    return newId;
  };
  app.post('/api/submit',requireUser,submitLimit,(req,res)=>{
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
        const newId = publishStation(clean, res.locals.user.nick || 'BTMAP', {
          updated: 'Weryfikacja parametrów stacji w BTMap',
          created: 'Utworzenie stacji w bazie BTMap',
        });
        db.prepare('INSERT INTO queue(id,type,data,userNick,createdAt,userId,status) VALUES(?,?,?,?,?,?,?)').run(id,'NEW_STATION',JSON.stringify(clean),res.locals.user.nick,new Date().toISOString(),res.locals.user.id,'APPROVED');
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
      // Reviewing a REPORT never changes station data. Approving a NEW_STATION publishes it as a BTMap record.
      let towerId: string | undefined;
      if(req.body.action==='APPROVE'){
        if(item.type==='TOWER') throw new Error('Starsze zgłoszenie nie jest już obsługiwane.');
        if(item.type==='NEW_STATION'){
          const stData=JSON.parse(String(item.data));
          towerId=publishStation({
            operator:text(stData.operator,50),
            stationId:text(stData.stationId,50),
            address:text(stData.address,300),
            province:text(stData.province,50),
            lat:Number(stData.lat),
            lng:Number(stData.lng),
            mastType:text(stData.mastType,100),
            owner:text(stData.owner,100),
            height:Number(stData.height)||null,
            notes:text(stData.notes,2000),
            cells:stData.cells,
            sourceTowerId:text(stData.sourceTowerId,200)||null,
          }, String(item.userNick || 'Moderator'), {
            updated: 'Zatwierdzenie aktualizacji stacji przez moderatora',
            created: 'Zatwierdzenie nowej stacji przez moderatora',
          });
          if(item.userId){
            db.prepare('UPDATE users SET points=points+10 WHERE id=?').run(item.userId);
          }
        }
      }
      db.prepare('UPDATE queue SET status=? WHERE id=?').run(req.body.action==='APPROVE'?'APPROVED':'REJECTED',item.id);
      log(res.locals.user.nick,req.body.action,String(item.id));db.exec('COMMIT');cachedStats=null;invalidateStatsCache();res.json(towerId?{ok:true,towerId}:{ok:true});
    } catch(e){db.exec('ROLLBACK');res.status(400).json({error:(e as Error).message});}
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'Nie znaleziono tej funkcji API.'}));
  app.use((error:Error&{type?:string},_req:Request,res:Response,_next:NextFunction)=>{
    if(error.type==='entity.too.large')return res.status(413).json({error:'Przesyłane dane są za duże. Zdjęcie może mieć maksymalnie 15 MB.'});
    console.error(error.message);res.status(500).json({error:'Nie udało się wykonać operacji. Spróbuj ponownie.'});});
  return app;
}
