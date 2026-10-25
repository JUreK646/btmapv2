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
import {getTelecomStats, invalidateStatsCache} from './stats.ts';

type User = { id: string; email: string; nick: string; role: string; points: number; level: number; avatar?: string | null; googleId?: string | null };
const publicUser = (user: Record<string, unknown>) => ({ id:user.id, email:user.email, nick:user.nick, role:user.role, points:user.points, level:user.level, avatar:user.avatar || null, googleId:user.googleId || null });
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

  app.get('/api/auth/google/config', (_req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
    res.json({
      enabled: true,
      configured: Boolean(clientId),
      clientId: clientId || null,
    });
  });

  app.post('/api/auth/google', rateLimit, async (req, res) => {
    try {
      const { credential, devUser } = req.body || {};
      let googleId = '';
      let email = '';
      let name = '';
      let avatar: string | null = null;

      if (credential && typeof credential === 'string') {
        // Verify real Google ID token with Google's public tokeninfo endpoint
        const verifyResp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
        if (!verifyResp.ok) {
          return res.status(401).json({ error: 'Nieprawidłowy lub wygasły token uwierzytelniania Google.' });
        }
        const payload = await verifyResp.json() as Record<string, unknown>;
        if (!payload.email || (payload.email_verified !== 'true' && payload.email_verified !== true)) {
          return res.status(401).json({ error: 'Konto Google nie posiada zweryfikowanego adresu e-mail.' });
        }
        googleId = String(payload.sub);
        email = String(payload.email).toLowerCase();
        name = String(payload.name || payload.given_name || email.split('@')[0]);
        avatar = payload.picture ? String(payload.picture) : null;
      } else if (devUser && typeof devUser === 'object') {
        // Dev / Localhost simulation when Google Client ID is not yet configured
        const devEmail = text((devUser as any).email, 254).toLowerCase();
        if (!devEmail || !devEmail.includes('@')) {
          return res.status(400).json({ error: 'Podaj poprawny adres e-mail konta Google.' });
        }
        googleId = (devUser as any).sub ? String((devUser as any).sub) : `g_dev_${createHash('md5').update(devEmail).digest('hex').slice(0, 16)}`;
        email = devEmail;
        name = text((devUser as any).name, 60) || email.split('@')[0];
        avatar = (devUser as any).picture ? String((devUser as any).picture) : null;
      } else {
        return res.status(400).json({ error: 'Brak danych uwierzytelniania Google.' });
      }

      // Check if user already exists
      const existing = db.prepare('SELECT * FROM users WHERE googleId = ? OR email = ? COLLATE NOCASE').get(googleId, email) as (User & Record<string, unknown>) | undefined;
      if (existing) {
        db.prepare('UPDATE users SET googleId = COALESCE(googleId, ?), avatar = COALESCE(avatar, ?) WHERE id = ?').run(googleId, avatar, existing.id);
        setSession(res, String(existing.id));
        log(existing.nick, 'LOGIN_GOOGLE', String(existing.id));
        const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id) as Record<string, unknown>;
        return res.json(publicUser(updated));
      }

      // Generate unique nickname
      let baseNick = name.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_-]/g, '').slice(0, 20) || email.split('@')[0].slice(0, 20);
      if (baseNick.length < 2) baseNick = 'Uzytkownik';
      let uniqueNick = baseNick;
      let counter = 1;
      while (db.prepare('SELECT id FROM users WHERE nick = ? COLLATE NOCASE').get(uniqueNick)) {
        uniqueNick = `${baseNick.slice(0, 15)}_${counter++}`;
      }

      const newId = randomUUID();
      db.prepare('INSERT INTO users(id, email, nick, password, avatar, googleId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(newId, email, uniqueNick, null, avatar, googleId, new Date().toISOString());
      setSession(res, newId);
      log(uniqueNick, 'REJESTRACJA_GOOGLE', newId);
      const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(newId) as Record<string, unknown>;
      return res.status(201).json(publicUser(newUser));
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message || 'Błąd logowania przez Google.' });
    }
  });

  app.get('/api/auth/google/url', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
    if (!clientId) {
      return res.status(400).json({ error: 'Logowanie Google nie zostało jeszcze skonfigurowane w pliku .env (brak GOOGLE_CLIENT_ID).' });
    }
    const host = req.get('host') || '127.0.0.1:5174';
    const proto = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const redirectUri = `${proto}://${host}/api/auth/google/callback`;
    const state = randomBytes(16).toString('hex');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, state });
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    try {
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      if (!code) return res.status(400).send('Brak kodu autoryzacyjnego Google.');

      const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
      const host = req.get('host') || '127.0.0.1:5174';
      const proto = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      const redirectUri = `${proto}://${host}/api/auth/google/callback`;

      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResp.ok) {
        return res.status(400).send('Nie udało się wymienić kodu autoryzacji Google na token.');
      }
      const tokenData = await tokenResp.json() as Record<string, unknown>;
      const accessToken = String(tokenData.access_token || '');

      const userResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!userResp.ok) return res.status(400).send('Błąd pobierania profilu użytkownika Google.');
      const profile = await userResp.json() as Record<string, unknown>;

      const googleId = String(profile.sub);
      const email = String(profile.email || '').toLowerCase();
      const name = String(profile.name || profile.given_name || email.split('@')[0]);
      const avatar = profile.picture ? String(profile.picture) : null;

      let userRow = db.prepare('SELECT * FROM users WHERE googleId = ? OR email = ? COLLATE NOCASE').get(googleId, email) as (User & Record<string, unknown>) | undefined;
      let userId: string;
      if (userRow) {
        userId = String(userRow.id);
        db.prepare('UPDATE users SET googleId = COALESCE(googleId, ?), avatar = COALESCE(avatar, ?) WHERE id = ?').run(googleId, avatar, userId);
        log(userRow.nick, 'LOGIN_GOOGLE_OAUTH', userId);
      } else {
        userId = randomUUID();
        let baseNick = name.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_-]/g, '').slice(0, 20) || email.split('@')[0].slice(0, 20);
        if (baseNick.length < 2) baseNick = 'Uzytkownik';
        let uniqueNick = baseNick;
        let counter = 1;
        while (db.prepare('SELECT id FROM users WHERE nick = ? COLLATE NOCASE').get(uniqueNick)) {
          uniqueNick = `${baseNick.slice(0, 15)}_${counter++}`;
        }
        db.prepare('INSERT INTO users(id, email, nick, password, avatar, googleId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(userId, email, uniqueNick, null, avatar, googleId, new Date().toISOString());
        log(uniqueNick, 'REJESTRACJA_GOOGLE_OAUTH', userId);
      }

      setSession(res, userId);
      const authenticatedUser = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId)!);

      // Return a self-closing HTML page that posts the message to opener or redirects
      res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Zalogowano przez Google</title></head>
<body style="font-family:system-ui;text-align:center;padding:40px;">
  <p>Pomyślnie zalogowano przez Google. Zamykanie okna…</p>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', user: ${JSON.stringify(authenticatedUser)} }, '*');
      window.close();
    } else {
      window.location.href = '/';
    }
  </script>
</body>
</html>`);
    } catch (e) {
      res.status(500).send('Wystąpił błąd podczas autoryzacji Google: ' + (e as Error).message);
    }
  });
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
            db.prepare('UPDATE towers SET mastType=COALESCE(?, mastType), owner=COALESCE(?, owner), notes=COALESCE(?, notes) WHERE id=?').run(stData.mastType||null, stData.owner||null, stData.notes||null, stData.sourceTowerId);
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
