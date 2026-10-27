import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { sequelize } from '../models/db.js';
const file=path.resolve(process.argv[2] || '');
const root=path.resolve('.local/backups');
if (!file.startsWith(root+path.sep) || !file.endsWith('.sql')) throw new Error('Select the verified SQL backup inside .local/backups');
const manifest=JSON.parse(await fs.readFile(`${file}.manifest.json`,'utf8'));
const checksum=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
if(checksum!==manifest.sha256)throw new Error('Backup checksum mismatch');
const snapshot={};
let originalSchemaMigrationRows=[];
const hash=rows=>crypto.createHash('sha256').update(JSON.stringify(rows.map(r=>JSON.stringify(r)).sort())).digest('hex');
const run=args=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit',env:process.env,windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Migration verification failed')));});
try {
  // The restore gate runs on this exact backup before touching the real schema.
  await run(['scripts/verify-backup.js',file,'--migrate']);
  for(const [table,count] of Object.entries(manifest.tables)){
    const [rows]=await sequelize.query('SELECT * FROM '+sequelize.getQueryInterface().quoteIdentifier(table));
    if(rows.length!==count)throw new Error('Live table count differs from the fresh backup; take a new snapshot before migrating');
    if(table.toLowerCase()==='schema_migrations')originalSchemaMigrationRows=rows;
    const columns=Object.keys(await sequelize.getQueryInterface().describeTable(table));
    snapshot[table]={columns,count,hash:hash(rows)};
    if(manifest.tableSignatures?.[table] && snapshot[table].hash!==manifest.tableSignatures[table]) throw new Error('Live fields differ from the selected backup; freeze application writes and take a new snapshot');
  }
  await run(['scripts/migrate-schema.js','--apply','--backup-confirmed']);
  for(const [table,before] of Object.entries(snapshot)){
    const quote=sequelize.getQueryInterface().quoteIdentifier.bind(sequelize.getQueryInterface());
    if(table.toLowerCase()==='schema_migrations'){
      const [rows]=await sequelize.query('SELECT * FROM '+quote(table));
      const oldVersions=new Set(originalSchemaMigrationRows.map(row=>row.version));
      const preserved=rows.filter(row=>oldVersions.has(row.version));
      if(rows.length!==before.count+1||!rows.some(row=>row.version==='20261024_01_system_feedback'))throw new Error('Migration ledger did not record exactly the expected additive feedback migration');
      if(preserved.length!==originalSchemaMigrationRows.length||hash(preserved)!==before.hash)throw new Error('Historical schema migration records changed; inspect before starting the application');
      continue;
    }
    const [rows]=await sequelize.query('SELECT '+before.columns.map(quote).join(',')+' FROM '+quote(table));
    if(rows.length!==before.count || hash(rows)!==before.hash)throw new Error('Preservation check differs for '+table+'; retain the backup and inspect before starting the application');
  }
  console.log(`PASS: current database upgraded; all ${Object.keys(snapshot).length} original tables, row counts and field values preserved.`);
}catch(error){console.error('Verified migration stopped:',error.message);process.exitCode=1;}
finally{await sequelize.close();}
