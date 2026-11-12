import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {googleSession,googleAttribution} from '../src/lib/googleTiles.ts';

test('Google requests use the official satellite session and escaped viewport attribution',async()=>{
  const requests:{url:string;options?:RequestInit}[]=[];
  const mocked=mock.method(globalThis,'fetch',async(input:string,options?:RequestInit)=>{
    requests.push({url:String(input),options});
    return Response.json(requests.length===1?{session:'test-session',expiry:String(Math.floor(Date.now()/1000)+3600),tileWidth:256,tileHeight:256}:{copyright:'Map data © Google & <provider>'});
  });
  try{
    const signal=new AbortController().signal;
    await assert.rejects(googleSession('',signal));assert.equal(requests.length,0);
    const session=await googleSession('test-key',signal);
    assert.equal(requests[0].url,'https://tile.googleapis.com/v1/createSession?key=test-key');
    assert.deepEqual(JSON.parse(String(requests[0].options?.body)),{mapType:'satellite',language:'pl-PL',region:'PL'});
    assert.equal((await googleSession('test-key',signal)).session,session.session);assert.equal(requests.length,1);
    const credit=await googleAttribution('test-key',session.session,{north:53,south:52,east:22,west:21,zoom:12},signal);
    assert.equal(credit,'Map data © Google &amp; &lt;provider&gt;');
    const url=new URL(requests[1].url);assert.equal(url.pathname,'/tile/v1/viewport');assert.equal(url.searchParams.get('north'),'53');assert.equal(url.searchParams.get('session'),'test-session');
  }finally{mocked.mock.restore();}
});

test('Google errors and missing credits cannot be presented as an available map',async()=>{
  const mocked=mock.method(globalThis,'fetch',async()=>Response.json({error:'denied'},{status:403}));
  const signal=new AbortController().signal;
  try{
    await assert.rejects(googleSession('denied-key',signal),/niedostępne/);
    await assert.rejects(googleAttribution('denied-key','session',{north:53,south:52,east:22,west:21,zoom:12},signal),/niedostępne/);
    mocked.mock.mockImplementation(async()=>Response.json({}));
    await assert.rejects(googleAttribution('key','session',{north:53,south:52,east:22,west:21,zoom:12},signal),/informacji/);
  }finally{mocked.mock.restore();}
});
