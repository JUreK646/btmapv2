import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/database.ts';
import {getTowers} from '../server/query.ts';
import {createApp} from '../server/app.ts';
import {once} from 'node:events';

function fixture(){
  const db=openDatabase(':memory:');
  const insert=db.prepare("INSERT INTO towers(id,stationId,address,province,lat,lng,operators,source,status) VALUES(?,?,?,?,?,?,?,?,'APPROVED')");
  for(let i=0;i<120;i++)insert.run(`orange${i}`,`O${i}`,`Warszawa, Aleja ${i}`,'Mazowieckie',52.23,21.01,JSON.stringify([{name:'Orange',bands:[{tech:'LTE',band:'1800'}]}]),'UKE');
  insert.run('rare','P1','Łódź, Piękna 1','Łódzkie',51.75,19.46,JSON.stringify([{name:'Play',bands:[{tech:'5G',band:'3500'}]}]),'UKE');
  insert.run('mixed','M1','Gdańsk, Morska 2','Pomorskie',54.35,18.65,JSON.stringify([{name:'Plus',bands:[{tech:'LTE',band:'900'}]},{name:'Orange',bands:[{tech:'5G',band:'3500'}]}]),'UKE');
  insert.run('community','C1','Kraków, Długa 1','Małopolskie',50.06,19.94,JSON.stringify([{name:'Plus',bands:[]}]),'User');
  return db;
}
test('filters run before pagination and match operator, technology and band together',()=>{
  const db=fixture();
  assert.equal(getTowers(db,{operators:'Play',limit:'1'}).total,1);
  assert.equal(getTowers(db,{operators:'Play',limit:'1'}).items[0].id,'rare');
  assert.equal(getTowers(db,{operators:'Plus',techs:'5G',bands:'3500'}).total,0);
  assert.equal(getTowers(db,{operators:'Orange',techs:'5G',bands:'3500'}).total,1);
  assert.equal(getTowers(db,{source:'UKE'}).total,122);
  assert.equal(getTowers(db,{source:'BTMAP'}).total,1);
  assert.equal(getTowers(db,{source:'ALL'}).total,123);
  assert.ok(getTowers(db,{source:'UKE'}).items.every(tower=>tower.source==='UKE'));
  assert.equal(getTowers(db,{q:'nonexistent'}).total,0);
  assert.equal(getTowers(db,{q:'Krakow'}).items[0].id,'community');
  assert.equal(getTowers(db,{q:'lodz'}).items[0].id,'rare');
  assert.equal(getTowers(db,{q:'%'}).total,0);
  assert.equal(getTowers(db,{limit:'50',offset:'50'}).items.length,50);
  assert.throws(()=>getTowers(db,{minLat:'bad'}));
  db.close();
});
test('zoomed out map keeps individual stations instead of grouping them',()=>{
  const db=fixture();const row=db.prepare("INSERT INTO towers(id,address,lat,lng,operators,source,status) VALUES(?,?,?,?,'[]','UKE','APPROVED')");
  for(let i=0;i<600;i++)row.run(`extra${i}`,'Polska',50+(i%10)/10,18+(i%13)/10);
  const result=getTowers(db,{view:'map',zoom:'7'});
  assert.equal(result.items.length,723);assert.equal(result.items.length,result.total);assert.equal('clusters' in result,false);db.close();
});
test('map caps individual stations at 1000 at every zoom after viewport and operator filtering',()=>{
  const db=openDatabase(':memory:');
  try{
    const row=db.prepare("INSERT INTO towers(id,address,lat,lng,operators,source,status) VALUES(?,?,?,?,?,'UKE','APPROVED')");
    const orange=JSON.stringify([{name:'Orange',bands:[{tech:'LTE',band:'1800'}]}]);
    const play=JSON.stringify([{name:'Play',bands:[{tech:'5G',band:'3500'}]}]);
    for(let i=0;i<1000;i++)row.run(`visible${i}`,'Warszawa',52.20+(i%20)*0.001,21.00+Math.floor(i/20)*0.001,orange);
    row.run('outside','Gdańsk',54.35,18.65,orange);
    const viewport={view:'map',zoom:'14',minLat:52.19,maxLat:52.23,minLng:20.99,maxLng:21.06};
    const exact=getTowers(db,viewport);
    assert.equal(exact.total,1000);
    assert.equal(exact.items.length,1000);
    assert.equal(exact.limit,1000);
    assert.equal(exact.hasMore,false);
    assert.equal('clusters' in exact,false);
    assert.ok(exact.items.every(t=>t.id!=='outside'));
    row.run('extra','Warszawa',52.21,21.01,play);
    for(const zoom of [5,7,12,14,18]){
      const capped=getTowers(db,{...viewport,zoom,limit:'99999'});
      assert.equal(capped.total,1000);
      assert.equal(capped.items.length,1000);
      assert.equal(capped.limit,1000);
      assert.equal(capped.hasMore,false);
      assert.equal(new Set(capped.items.map(t=>t.id)).size,1000);
      assert.equal('clusters' in capped,false);
    }
    const filtered=getTowers(db,{...viewport,operators:'Orange',limit:'99999'});
    assert.equal(filtered.total,1000);
    assert.equal(filtered.limit,1000);
    assert.equal(filtered.items.length,1000);
    assert.equal(filtered.hasMore,false);
    assert.ok(filtered.items.every(t=>t.id!=='extra'&&t.id!=='outside'));
    const closer=getTowers(db,{...viewport,maxLat:52.205,limit:'99999'});
    assert.ok(closer.total>0&&closer.total<1000);
    assert.equal(closer.items.length,closer.total);
    assert.equal(closer.hasMore,false);
  }finally{db.close();}
});

test('real session, validation, comments and admin moderation work end to end',async()=>{
  const db=fixture(),server=createApp(db).listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address() as {port:number},base=`http://127.0.0.1:${address.port}/api`;
  let cookie='';
  const request=(path:string,body?:unknown)=>fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',cookie},body:body?JSON.stringify(body):undefined});
  try{
    assert.equal((await request('/admin/queue')).status,403);
    assert.equal((await request('/submit',{type:'TOWER',data:{}})).status,401);
    assert.equal((await request('/auth/login',{email:'not@here.pl',password:'bad'})).status,401);
    const registration=await request('/auth/register',{email:'test@example.com',nick:'Tester',password:'long-password-123'});
    assert.equal(registration.status,201);const user=await registration.json() as {id:string;password?:string};assert.equal(user.password,undefined);
    const setCookie=registration.headers.get('set-cookie')!;assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/i);cookie=setCookie.split(';')[0];
    assert.equal((await (await request('/auth/me')).json()).id,user.id);
    assert.equal((await request('/admin/queue')).status,403);
    const badOrigin=await fetch(base+'/submit',{method:'POST',headers:{'Content-Type':'application/json',cookie,Origin:'https://other.example'},body:'{}'});assert.equal(badOrigin.status,403);
    assert.equal((await request('/submit',{type:'TOWER',data:{address:'Example',lat:'',lng:'',operators:[]}})).status,400);
    const ukeComment=await request('/towers/rare/comments',{text:'UKE station comment'});assert.equal(ukeComment.status,403);
    const comment=await request('/towers/community/comments',{text:'Test observation',userNick:'Forged admin'});assert.equal(comment.status,201);assert.equal((await comment.json()).userNick,'Tester');
    assert.equal((await request('/towers/nonexistent')).status,404);
    assert.equal((await request('/towers/nonexistent/comments')).status,404);
    const health=await (await request('/health')).json();assert.equal(health.stats.towers,123);assert.equal(health.stats.community,undefined);
    assert.equal((await request('/submit',{type:'TOWER',data:{address:'Test station',lat:52,lng:21,operators:[{name:'Play',bands:[]}]}})).status,400);
    assert.equal((await request('/submit',{type:'REPORT',data:{towerId:'rare',category:'other',notes:'short'}})).status,400);
    const before=JSON.stringify(db.prepare('SELECT * FROM towers ORDER BY id').all());
    const submitted=await request('/submit',{type:'REPORT',data:{towerId:'rare',category:'location',notes:'Please check the address of this station.'}});assert.equal(submitted.status,201);
    const submission=await submitted.json();
    db.prepare("UPDATE users SET role='ADMIN' WHERE id=?").run(user.id);
    const queue=await (await request('/admin/queue')).json();assert.equal(queue.length,1);
    assert.equal((await request('/admin/moderate',{id:submission.id,action:'APPROVE'})).status,200);
    assert.equal((await request('/admin/moderate',{id:submission.id,action:'APPROVE'})).status,404);
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM towers ORDER BY id').all()),before);
    const mine=await (await request('/my/submissions')).json();assert.equal(mine[0].status,'APPROVED');
    db.prepare("INSERT INTO queue(id,type,data,userNick,userId,status) VALUES('old','TOWER','{}','Tester',?,'PENDING')").run(user.id);
    assert.equal((await request('/admin/moderate',{id:'old',action:'APPROVE'})).status,400);
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM towers ORDER BY id').all()),before);
    assert.equal((await request('/auth/logout',{})).status,200);assert.equal(await (await request('/auth/me')).json(),null);
    const login=await request('/auth/login',{email:'test@example.com',password:'long-password-123'});assert.equal(login.status,200);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});
