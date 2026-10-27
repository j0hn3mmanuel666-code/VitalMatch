import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { spawn } from 'node:child_process';
import { sequelize } from '../models/db.js';
const file = path.resolve(process.argv[2] || '');
const root = path.resolve('.local/backups');
if (!file.startsWith(root + path.sep) || !file.endsWith('.sql')) throw new Error('Select a SQL backup inside .local/backups');
const sql = await fs.readFile(file, 'utf8');
const manifest = JSON.parse(await fs.readFile(`${file}.manifest.json`, 'utf8'));
if (manifest.supersededBy) throw new Error('Use the corrected verified snapshot: '+manifest.supersededBy);
if (crypto.createHash('sha256').update(sql).digest('hex') !== manifest.sha256) throw new Error('Backup checksum mismatch');
const database = `vitalmatch_restore_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const connection = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', multipleStatements: true, dateStrings:['DATE'],timezone:sequelize.options.timezone });
await connection.query('SET time_zone = ?', [sequelize.options.timezone]);
let created = false;
const signatures = {};
const originalRowsByTable = {};
try {
  await connection.query(`CREATE DATABASE \`${database}\``); created = true;
  await connection.query(`USE \`${database}\``);
  await connection.query(sql);
  for (const [table, count] of Object.entries(manifest.tables)) {
    const [[row]] = await connection.query('SELECT COUNT(*) AS count FROM ??', [table]);
    if (Number(row.count) !== count) throw new Error(`Restored row count differs for ${table}`);
    const [data] = await connection.query('SELECT * FROM ??', [table]);
    originalRowsByTable[table] = data;
    signatures[table] = { columns: data.length ? Object.keys(data[0]) : [], hash: crypto.createHash('sha256').update(JSON.stringify(data.map(r => JSON.stringify(r)).sort())).digest('hex') };
    if (manifest.tableSignatures?.[table] && signatures[table].hash !== manifest.tableSignatures[table]) throw new Error(`Restored original field values differ for ${table}`);
  }
  console.log(`PASS: checksum, schema restoration and all ${Object.keys(manifest.tables).length} table counts${manifest.tableSignatures ? ' and original field values' : ''} verified in an isolated temporary database.`);
  if (process.argv.includes('--migrate')) {
    for (let repeat = 0; repeat < 2; repeat++) await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/migrate-schema.js', '--apply', '--backup-confirmed'], { env: { ...process.env, DB_NAME: database, NODE_ENV: 'test', EMAIL_OUTBOX_ENABLED: 'false' }, stdio: 'inherit', windowsHide: true });
      child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('Restored-database migration failed')));
    });
    for (const [table, signature] of Object.entries(signatures)) {
      if (table.toLowerCase() === 'schema_migrations') {
        const [rows] = await connection.query('SELECT * FROM ??', [table]);
        const oldVersions = new Set(originalRowsByTable[table].map(row => row.version));
        const preserved = rows.filter(row => oldVersions.has(row.version));
        if (rows.length !== manifest.tables[table] + 1 || !rows.some(row => row.version === '20261024_01_system_feedback')) throw new Error('Migration ledger did not record exactly the expected additive feedback migration');
        const preservedHash = crypto.createHash('sha256').update(JSON.stringify(preserved.map(r => JSON.stringify(r)).sort())).digest('hex');
        if (preserved.length !== originalRowsByTable[table].length || preservedHash !== signature.hash) throw new Error('Migration changed historical schema migration records');
        continue;
      }
      const [[row]] = await connection.query('SELECT COUNT(*) AS count FROM ??', [table]);
      if (Number(row.count) !== manifest.tables[table]) throw new Error(`Migration changed historic row count: ${table}`);
      if (!signature.columns.length) continue;
      const [data] = await connection.query('SELECT ?? FROM ??', [signature.columns, table]);
      const hash = crypto.createHash('sha256').update(JSON.stringify(data.map(r => JSON.stringify(r)).sort())).digest('hex');
      if (hash !== signature.hash) throw new Error(`Migration changed preserved historical fields: ${table}`);
    }
    console.log('PASS: additive migration applied twice to restored existing data; all historical rows and original fields preserved.');
  }
} finally {
  if (created && /^vitalmatch_restore_test_\d+_[a-f0-9]{8}$/.test(database)) await connection.query(`DROP DATABASE \`${database}\``);
  await connection.end();
  await sequelize.close();
}
