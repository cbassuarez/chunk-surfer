import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {ACHIEVEMENT_DEFS} from '../src/progression/achievement-defs.js';
import {STAT_DEFS} from '../src/progression/stat-defs.js';

const output=resolve('artifacts/achievements-v1/steam');
const appOption=process.argv.slice(2).find(arg=>arg.startsWith('--app-id='));
const previous=await readFile(resolve('src-tauri/steam-achievements-v1.json'),'utf8').then(JSON.parse).catch(()=>({}));
const appId=appOption?Number(appOption.slice('--app-id='.length)):previous.appId??null;
if(appId!==null&&(!Number.isInteger(appId)||appId<=0||appId===480||appId>4294967295))throw Error('Supply the real Steam application ID; zero and sample application480 are refused.');
const schema={version:1,appId,achievements:ACHIEVEMENT_DEFS.map(d=>d.id),stats:Object.values(STAT_DEFS).map(d=>d.platformId)};
if(new Set(schema.achievements).size!==schema.achievements.length)throw Error('Duplicate Steam API achievement ID');
if(schema.achievements.some(id=>!/^[A-Z0-9_-]{1,127}$/.test(id)))throw Error('Invalid Steam API achievement ID');
await mkdir(output,{recursive:true});
const csv=(rows)=>rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
const definitions=[['api_name','setid','permission','spoiler','archived','progress_stat_name','progress_stat_min','progress_stat_max'],
 ...ACHIEVEMENT_DEFS.map(d=>[d.id,'','Client',String(!!d.hidden),'false','','',''])];
const localization=[['api_name','field','english'],...ACHIEVEMENT_DEFS.flatMap(d=>[[d.id,'name',d.name],[d.id,'description',d.description]])];
const native=JSON.stringify(schema,null,2)+'\n';
await writeFile(resolve('src-tauri/steam-achievements-v1.json'),native);
await writeFile(resolve(output,'achievements-definitions.csv'),csv(definitions));
await writeFile(resolve(output,'achievements-localization.csv'),csv(localization));
await writeFile(resolve(output,'stats-configuration.json'),JSON.stringify({version:1,permission:'Client',
 stats:Object.entries(STAT_DEFS).map(([key,d])=>({api_name:d.platformId,type:'INT',default:0,min:0,max:2147483647,incrementOnly:true,localKey:key})),
 note:'Create and publish these integer stats in Steamworks App Admin. This is a configuration manifest, not an undocumented Steam stats CSV format.'},null,2)+'\n');
const iconRoot=resolve('public/assets/achievements');
const iconManifest=JSON.parse(await readFile(resolve(iconRoot,'manifest.json'),'utf8'));
if(iconManifest.version!==3||iconManifest.renderer?.kind!=='actual-achievement-resin-canvas')throw Error('Import and verify the semantic resin production Canvas icon bake before exporting Steam artwork.');
const icons=[];
await mkdir(resolve(output,'icons'),{recursive:true});
for(const def of ACHIEVEMENT_DEFS){
 const record=iconManifest.records.find(row=>row.id===def.id);
 if(!record)throw Error(`Generate the current icon set before exporting Steam: ${def.id}`);
 const row={id:def.id};
 for(const [state,suffix]of[['unlocked','ACHIEVED'],['locked','UNACHIEVED']]){
  const file=record.files[state]['256'],bytes=await readFile(resolve(iconRoot,file.path));
  const hash=createHash('sha256').update(bytes).digest('hex');
  if(hash!==file.sha256||bytes.readUInt32BE(16)!==256||bytes.readUInt32BE(20)!==256)throw Error(`Invalid production icon ${file.path}`);
  const name=`${def.id}_${suffix}.png`;await writeFile(resolve(output,'icons',name),bytes);
  row[state]={path:'icons/'+name,source:'public/assets/achievements/'+file.path,sha256:hash,bytes:bytes.length};
 }
 icons.push(row);
}
await writeFile(resolve(output,'manifest.json'),JSON.stringify({kind:'steam-achievement-release-files',version:1,appId,achievementCount:schema.achievements.length,
 nativeWhitelistSha256:createHash('sha256').update(native).digest('hex'),baseGameSet:true,published:false,steamVerified:false,
 sources:['https://partner.steamgames.com/doc/features/achievements/ach_guide','https://partner.steamgames.com/doc/api/ISteamUserStats'],
 icons,
 steps:['Configure the actual game with node scripts/export-steam-achievements.mjs --app-id=YOUR_REAL_APP_ID; rebuild the native app.','Stage the licensed Steamworks redistributable using the existing package script.','Create and publish the exact stat IDs from stats-configuration.json.','Import the definitions, English localization and achieved/unachieved PNG files into the base game set.','Review, save and publish Steamworks changes; enable Steam Achievements in store supported features.','Verify on the real application with a developer account: offline unlock, restart, callback-confirmed upload and overlay.'],
 limits:['No AppID, credentials, publisher action or online unlock is supplied by this export.','Never use Steam sample AppID480 or reset all users to test the catalog.','Future released content should use an additional set or a frozen completion edition, preserving existing completions.']},null,2)+'\n');
await writeFile(resolve(output,'README.txt'),[
 'CHUNK SURFER — ACHIEVEMENTS V1',
 `${schema.achievements.length} base-game achievements; every award contributes to in-game100%completion.`,
 'This package is prepared locally. Nothing has been published or unlocked on Steam.',
 '',
 '1. Obtain the real game AppID and licensed Steamworks redistributable.',
 '2. Configure that AppID using the exporter --app-id option, then rebuild the native game.',
 '3. Create and publish the exact integer stats in stats-configuration.json.',
 '4. Extract this folder. Import achievements-definitions.csv, achievements-localization.csv and the PNGs inside icons/ through Steamworks Bulk Import/Export.',
 '5. Keep these awards in the base game set. Review all names, descriptions, spoiler flags and icons before publishing. Enable Steam Achievements in store Supported Features.',
 '6. Test on the real application: offline earning and restart, callback-confirmed upload, progress from another launch, and the Steam overlay. The local synthetic API tests do not certify that path.',
 '',
 'Native writes are disabled while appId is absent or mismatches the actual game. Sample AppID480 is refused.',
 'The PNGs are byte-identical copies of the production illuminated-resin artwork used by the game. Original solid emblems, canonical category colors, resin lenses and material frames share the shipping Canvas renderer. No SDK, API keys, account data or unlicensed imagery is included.',
 'Official reference: https://partner.steamgames.com/doc/features/achievements/ach_guide',
 '',
].join('\n'));
console.log(`Exported ${schema.achievements.length} achievements and ${schema.stats.length} stats; definitions remain unpublished.`);
