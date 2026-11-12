import {test} from 'node:test';
import assert from 'node:assert/strict';
import {operatorName,operatorColor} from '../shared/operators.ts';
import {openDatabase} from '../server/database.ts';
import {mkdtempSync,existsSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('official SI2PEM names share the station brand colors without replacing source names',()=>{
  for(const [name,brand] of [['Orange Polska S.A.','Orange'],['T–Mobile Polska S.A.','T-Mobile'],['P4 Sp. z o.o.','Play'],['On Tower Poland Sp. z o.o.','Play'],['Towerlink Poland Sp. z o.o.','Plus'],['Polkomtel Sp. z o.o.','Plus'],['Aero2','Plus'],['PGE Systemy','Inne']]){
    assert.equal(operatorName(name),brand);assert.equal(operatorColor(name),operatorColor(brand));
  }
});
test('saved Towerlink measurements are reclassified so the Plus filter includes them',()=>{
  const directory=mkdtempSync(join(tmpdir(),'btmap-colors-')),filename=join(directory,'test.sqlite');
  let db=openDatabase(filename);
  try{
    db.prepare("DELETE FROM metadata WHERE key='pemOperatorColorsV2'").run();
    const plan={operatorName:'Towerlink Poland Sp. z o.o.',operator:'Inne'};
    db.prepare('INSERT INTO pem_plans VALUES(?,?,?,?,?,?)').run('1',52,21,'Inne','2026-10-20',JSON.stringify(plan));
    db.close();db=openDatabase(filename);
    const saved=db.prepare("SELECT operator,data FROM pem_plans WHERE id='1'").get()!;
    assert.equal(saved.operator,'Plus');assert.equal(JSON.parse(String(saved.data)).operator,'Plus');
    assert.equal(JSON.parse(String(saved.data)).operatorName,'Towerlink Poland Sp. z o.o.');
  }finally{db.close();for(const path of [filename,filename+'-shm',filename+'-wal'])if(existsSync(path))unlinkSync(path);rmdirSync(directory);}
});
