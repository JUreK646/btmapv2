import { spawn } from 'node:child_process';
// In development the Vite proxy (vite.config.ts) forwards /api to port 3001, so the API always runs there.
// A PORT inherited from the environment (preview tools, hosting shells) would otherwise move the API onto
// Vite's own port 5174 and both processes would stop.
const apiEnv={...process.env,PORT:'3001'};
const children=[spawn(process.execPath,['--experimental-strip-types','server/start.ts'],{stdio:'inherit',env:apiEnv}),spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{stdio:'inherit'})];
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;children.forEach(c=>c.kill());process.exitCode=code;}
// A child that exits on its own is a failure even with code 0, so the shell sees that the dev server stopped.
children.forEach(c=>{c.on('error',()=>stop(1));c.on('exit',code=>{if(!stopping)console.error(`[dev] Proces zakończył się (kod ${code ?? 'brak'}), zatrzymuję serwer deweloperski.`);stop(code||1);});});
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
