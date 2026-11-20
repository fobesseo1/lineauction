// Remove non-apartment trades from the local warehouse (lineestate docs/apartment-only-plan.md 3-2 #5, 6단계;
// user "지워" 2026-11-20). The site tables were emptied on 11-19 and the collector fetches apartments only
// since 11-10, so these rows are no longer read by anything except two exceptions that stay:
//  - rh rows of the 빌라-filed K-APT complexes hand-linked in manual-place-links.json (231 places);
//  - nrg rows on lots listed in nrg-as-apt.json (empty on 11-20).
// Deleted rows and their month_loads go to a backup SQLite first; then VACUUM shrinks the file.
//   node scripts/molit/prune-non-apt.mjs [--dry-run]
import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdir,stat} from 'node:fs/promises';
import {placeId} from './summary.mjs';

const dry=process.argv.includes('--dry-run');
const WH='data/molit/warehouse.sqlite';
const BACKUP_DIR='data/backup/apartment-only-20261120';
const keepIds=new Set(JSON.parse(await readFile(new URL('./manual-place-links.json',import.meta.url),'utf8')).map(m=>m.place_id).filter(id=>!id.startsWith('apt:')));
const nrgKeep=new Set(JSON.parse(await readFile(new URL('./nrg-as-apt.json',import.meta.url),'utf8')).flatMap(e=>e.place_id??e.places??[]));
const db=new DatabaseSync(WH);
db.function('keep_place',{deterministic:true},(kind,lawd,umd,jibun)=>{const id=placeId(kind,lawd,umd,jibun);return keepIds.has(id)||nrgKeep.has(id)||nrgKeep.has(placeId('apt',lawd,umd,jibun))?1:0;});
const WHERE="kind not in ('apt','silv') and not keep_place(kind,lawd,umd,jibun)";
// month_loads: rh stays (its kept rows came from those loads); the other non-apartment APIs go.
const LOAD_WHERE="api in ('offiSale','offiRent','nrgSale','landSale','shSale','shRent')";
const count=sql=>db.prepare(sql).get().n;
console.log('before',db.prepare("select kind,count(*) n from trades group by kind").all().map(r=>`${r.kind} ${r.n}`).join(', '));
const del=count(`select count(*) n from trades where ${WHERE}`),loads=count(`select count(*) n from month_loads where ${LOAD_WHERE}`);
console.log(`delete trades ${del}, month_loads ${loads}; keep rh ${count("select count(*) n from trades where kind='rh' and keep_place(kind,lawd,umd,jibun)")}`);
if(dry){console.log('dry run');process.exit(0);}

await mkdir(BACKUP_DIR,{recursive:true});
const backup=`${BACKUP_DIR}/warehouse-non-apt.sqlite`;
db.exec(`attach database '${backup}' as b`);
db.exec("create table if not exists b.trades as select * from main.trades where 0");
db.exec("create table if not exists b.month_loads as select * from main.month_loads where 0");
if(count('select count(*) n from b.trades'))throw Error('BACKUP_NOT_EMPTY');
db.exec('begin');
db.exec(`insert into b.trades select * from main.trades where ${WHERE}`);
db.exec(`insert into b.month_loads select * from main.month_loads where ${LOAD_WHERE}`);
const copied=count('select count(*) n from b.trades');
if(copied!==del)throw Error(`BACKUP_COUNT ${copied}/${del}`);
db.exec(`delete from main.trades where ${WHERE}`);
db.exec(`delete from main.month_loads where ${LOAD_WHERE}`);
db.exec('commit');
db.exec('detach database b');
console.log('after',db.prepare("select kind,count(*) n from trades group by kind").all().map(r=>`${r.kind} ${r.n}`).join(', '));
const before=(await stat(WH)).size;
db.exec('vacuum');db.close();
console.log(`backup ${backup} ${(await stat(backup)).size} bytes; warehouse ${before} -> ${(await stat(WH)).size} bytes`);
