import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import mysql from 'mysql2';
import { sequelize } from '../models/db.js';

// Local logical snapshot. Credentials and rows are never written to the console.
// Restore into a NEW empty database; never overlay an existing database.
export async function backupDatabase(destination = path.resolve('.local/backups', `database-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`)) {
  const rowsByTable = {}, schema = [];
  await sequelize.transaction({ isolationLevel: 'REPEATABLE READ' }, async transaction => {
    const [tables] = await sequelize.query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"', { transaction });
    for (const table of tables.map(row => Object.values(row)[0]).sort()) {
      const quoted = sequelize.getQueryInterface().quoteIdentifier(table);
      const [definition] = await sequelize.query(`SHOW CREATE TABLE ${quoted}`, { transaction });
      const [rows] = await sequelize.query(`SELECT * FROM ${quoted}`, { transaction, raw: true });
      schema.push(`${definition[0]['Create Table']};`);
      rowsByTable[table] = rows;
    }
  });
  const statements = ['-- VitalMatch snapshot; restore only into a new empty database.', `SET time_zone = ${mysql.escape(sequelize.options.timezone)};`, 'SET FOREIGN_KEY_CHECKS=0;', ...schema];
  for (const [table, rows] of Object.entries(rowsByTable)) for (const row of rows) {
    const columns = Object.keys(row).map(key => mysql.escapeId(key)).join(',');
    const values = Object.values(row).map(value => mysql.escape(value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value) ? JSON.stringify(value) : value,false,sequelize.options.timezone)).join(',');
    statements.push(`INSERT INTO ${mysql.escapeId(table)} (${columns}) VALUES (${values});`);
  }
  statements.push('SET FOREIGN_KEY_CHECKS=1;');
  const sql = statements.join('\n') + '\n';
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, sql, { flag: 'wx', mode: 0o600 });
  const tableSignatures = Object.fromEntries(Object.entries(rowsByTable).map(([table,rows])=>[table,crypto.createHash('sha256').update(JSON.stringify(rows.map(r=>JSON.stringify(r)).sort())).digest('hex')]));
  const manifest = { file: path.basename(destination), sha256: crypto.createHash('sha256').update(sql).digest('hex'), tables: Object.fromEntries(Object.entries(rowsByTable).map(([table, rows]) => [table, rows.length])), tableSignatures, createdAt: new Date().toISOString() };
  await fs.writeFile(`${destination}.manifest.json`, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
  return { destination, manifest };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) {
  try { const result = await backupDatabase(); const {tableSignatures,...summary}=result.manifest;console.log(JSON.stringify({ destination: result.destination, ...summary }, null, 2)); }
  catch (error) { console.error('Backup failed:', error.code || error.name); process.exitCode = 1; }
  finally { await sequelize.close(); }
}
