import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('phone uniqueness rejects formatting variants on insert and update while allowing empty legacy numbers',async()=>{
 const db=new PGlite();try{
 await db.exec('create table public.users(id integer primary key, phone text);');
 await db.exec(await readFile(new URL('../../../supabase/migrations/004_unique_phone.sql',import.meta.url),'utf8'));
 await db.exec("insert into public.users values(1,'+977 980-123-4567'),(2,''),(3,''),(4,'+9779801234568');");
 await assert.rejects(db.exec("insert into public.users values(5,'9779801234567');"),e=>e.code==='23505');
 await assert.rejects(db.exec("update public.users set phone='+977 (980) 1234567' where id=4;"),e=>e.code==='23505');
 assert.equal((await db.query('select count(*)::int as n from public.users')).rows[0].n,4);
 }finally{await db.close();}
});
test('existing duplicate phones prevent migration without deleting accounts',async()=>{
 const db=new PGlite();try{
 await db.exec("create table public.users(id integer primary key,phone text);insert into public.users values(1,'123-4567'),(2,'1234567');");
 await assert.rejects(db.exec(await readFile(new URL('../../../supabase/migrations/004_unique_phone.sql',import.meta.url),'utf8')),e=>e.code==='23505');
 await db.exec('rollback;');
 assert.equal((await db.query('select count(*)::int as n from public.users')).rows[0].n,2);
 }finally{await db.close();}
});
