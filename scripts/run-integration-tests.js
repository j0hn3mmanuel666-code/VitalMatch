import 'dotenv/config';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
const database = `vitalmatch_audit_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const connection = await mysql.createConnection({ host:process.env.DB_HOST || 'localhost',port:Number(process.env.DB_PORT || 3306),user:process.env.DB_USER || 'root',password:process.env.DB_PASSWORD || '' });
const privateDirectory = path.resolve('.local/test-results',database);
await fs.mkdir(privateDirectory,{recursive:true});
const env = { ...process.env, DB_NAME:database,NODE_ENV:'test',BCRYPT_ROUNDS:'4',SESSION_SECRET:crypto.randomBytes(48).toString('hex'),EMAIL_OUTBOX_ENABLED:'false',COORDINATION_JOBS_ENABLED:'false',EMAIL_USER:'',EMAIL_PASS:'',EMAIL_HOST:'',BASE_URL:'http://localhost:3107',PORT:'3107',RUNTIME_SETTINGS_FILE:path.join(privateDirectory,'settings.json'),ELECTRON:'1' };
// Do not consume existing credentials/configuration in synthetic email tests.
await fs.writeFile(env.RUNTIME_SETTINGS_FILE,JSON.stringify({security:{sessionTimeout:30,minPasswordLength:8,requireSpecialChars:false},email:{},notifications:{emailNotificationsEnabled:false},general:{appName:'VitalMatch',systemStatus:'online',timeZone:'Asia/Manila'}}));
const run = (args, extra = {}) => new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd:process.cwd(),env:{...env,...extra},stdio:'inherit',windowsHide:true});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`Validation command failed (${args[0]}, exit ${code})`)));
});
let created=false;
try {
  await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);created=true;
  await run(['scripts/migrate-schema.js','--apply']);
  await run(['scripts/migrate-schema.js','--apply']);
  await run(['--test','tests/integration/*.test.js']);
  if (process.argv.includes('--browser')) await run(['scripts/run-browser-tests.js']);
} catch(error) { console.error(error.message);process.exitCode=1; }
finally {
  if (created && /^vitalmatch_audit_test_\d+_[a-f0-9]{8}$/.test(database)) await connection.query(`DROP DATABASE \`${database}\``);
  await connection.end();
}
