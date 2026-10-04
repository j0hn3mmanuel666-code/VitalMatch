import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { DataTypes, Op } from 'sequelize';
import { sequelize } from '../models/db.js';
import '../models/userModel.js';
import '../models/donorModel.js';
import '../models/bloodRequestModel.js';
import '../models/pledgeModel.js';
import '../models/scheduleTokenModel.js';
import '../models/userSettingModel.js';
import '../models/notificationModel.js';
import '../models/messageModel.js';
import '../models/callModel.js';
import '../models/passwordResetModel.js';
import '../models/publicContentModel.js';
import '../models/callForDonationModel.js';
import '../models/facilityModel.js';
import '../models/appointmentModel.js';
import '../models/workflowEventModel.js';
import '../models/requestAccessModel.js';
import '../models/emailOutboxModel.js';
import '../models/coordinationJobModel.js';
import '../services/auditService.js';

const SchemaMigration = sequelize.define('SchemaMigration', {
  version: { type: DataTypes.STRING(80), primaryKey: true },
  appliedAt: { type: DataTypes.DATE, allowNull: false }
}, { tableName: 'schema_migrations', timestamps: false });
if (!sequelize.models.Session) sequelize.define('Session', { sid: { type: DataTypes.STRING(36), primaryKey: true }, expires: DataTypes.DATE, data: DataTypes.TEXT }, { tableName: 'Sessions' });

export const migrationVersions = ['20261003_01_coordination_integrity'];
const indexDefinitions = [
  ['BloodRequests', 'idx_request_state_blood', ['status', 'bloodType', 'createdAt']],
  ['BloodRequests', 'idx_request_owner_date', ['userId', 'createdAt']],
  ['BloodRequests', 'idx_request_facility_review', ['facilityId', 'hospitalStatus', 'status']],
  ['BloodRequests', 'idx_request_legacy_hospital', ['hospitalId']],
  ['Donors', 'idx_donor_available_blood_date', ['isAvailable', 'bloodType', 'lastDonationDate']],
  ['Notifications', 'idx_notification_user_read_date', ['userId', 'isRead', 'createdAt']],
  ['Messages', 'idx_message_conversation_date', ['conversationId', 'createdAt']],
  ['Calls', 'idx_call_conversation_date', ['conversationId', 'initiatedAt']],
  ['Users', 'idx_user_facility_role_active', ['facilityId', 'role', 'isActive']]
];
function columnDefinition(attribute, existingTable = false) {
  const definition = { ...attribute };
  delete definition.Model; delete definition.fieldName; delete definition._modelAttribute;
  if (definition.references?.model?.getTableName) definition.references = { ...definition.references, model: definition.references.model.getTableName() };
  // Preserve unknown historic profile values instead of inventing replacements.
  const hasDefault = definition.defaultValue !== undefined && definition.defaultValue !== null;
  if (existingTable && !hasDefault && !definition.primaryKey) definition.allowNull = true;
  return definition;
}
export async function inspectSchema() {
  const qi = sequelize.getQueryInterface();
  const tables = (await qi.showAllTables()).map(table => typeof table === 'string' ? table : table.tableName);
  return { database: sequelize.getDatabaseName(), tables, migrations: tables.includes('schema_migrations') ? (await SchemaMigration.findAll({ raw: true })).map(r => r.version) : [], requiredVersions: migrationVersions };
}
export async function assertCurrentSchema() {
  const state = await inspectSchema();
  if (!migrationVersions.every(version => state.migrations.includes(version))) throw new Error('Database upgrade required. Review MIGRATION_GUIDE.md and apply the backed-up schema migration before starting VitalMatch.');
  const tables = new Map(state.tables.map(table => [String(table).toLowerCase(), table]));
  const qi = sequelize.getQueryInterface();
  const missing = [];
  await Promise.all(Object.values(sequelize.models).map(async model => {
    const name = String(model.getTableName()), actual = tables.get(name.toLowerCase());
    if (!actual) { missing.push(name); return; }
    const columns = await qi.describeTable(actual);
    for (const [field, attribute] of Object.entries(model.rawAttributes)) {
      if (!columns[attribute.field || field]) missing.push(name + '.' + field);
    }
  }));
  if (missing.length) {
    const error = new Error('Database schema does not match this release. Review MIGRATION_GUIDE.md and apply a reviewed versioned upgrade before starting VitalMatch.');
    error.code = 'SCHEMA_MISMATCH';
    error.missingSchemaObjects = missing.sort();
    throw error;
  }
}
export async function runMigrations(options = {}) {
  const connection = await sequelize.connectionManager.getConnection({ type: 'WRITE' });
  const lockName = 'vitalmatch_schema_' + createHash('sha256').update(sequelize.getDatabaseName()).digest('hex').slice(0, 40);
  const query = (sql, values) => new Promise((resolve, reject) => connection.query(sql, values, (error, rows) => error ? reject(error) : resolve(rows)));
  try {
    const rows = await query('SELECT GET_LOCK(?, 30) AS acquired', [lockName]);
    if (Number(rows[0].acquired) !== 1) throw new Error('Another schema upgrade is running');
    return await applyMigrations(options);
  } finally {
    await query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    await sequelize.connectionManager.releaseConnection(connection);
  }
}
async function applyMigrations({ backupConfirmed = false } = {}) {
  if (!process.env.DB_NAME) throw new Error('Set DB_NAME explicitly before migrating');
  const database = sequelize.getDatabaseName();
  const disposable = /^vitalmatch_audit_test_[a-zA-Z0-9_]+$/.test(database) && process.env.NODE_ENV === 'test';
  if (!disposable && !backupConfirmed) throw new Error('A verified backup is required; use --backup-confirmed after reviewing the migration');
  await sequelize.authenticate();
  const qi = sequelize.getQueryInterface();
  await SchemaMigration.sync();
  if (await SchemaMigration.findByPk(migrationVersions[0])) { await assertCurrentSchema(); return inspectSchema(); }
  const tables = (await qi.showAllTables()).map(table => typeof table === 'string' ? table : table.tableName);
  const tableMap = new Map(tables.map(table => [table.toLowerCase(), table]));
  if (tableMap.has('donors')) {
    const [duplicates] = await sequelize.query('SELECT userId FROM Donors GROUP BY userId HAVING COUNT(*) > 1 LIMIT 1');
    if (duplicates.length) throw new Error('Duplicate donor profiles require a reviewed consolidation before migration');
  }
  if (tableMap.has('users')) {
    const [duplicates] = await sequelize.query('SELECT email FROM Users GROUP BY email HAVING COUNT(*) > 1 LIMIT 1');
    if (duplicates.length) throw new Error('Duplicate account emails require review before migration');
  }
  // A facility must exist before a new account/request reference is added.
  await sequelize.models.Facility.sync();
  for (const model of Object.values(sequelize.models)) {
    const table = model.getTableName();
    const actualTable = tableMap.get(String(table).toLowerCase());
    if (!actualTable || table === 'schema_migrations') continue;
    const columns = await qi.describeTable(actualTable);
    for (const [name, attribute] of Object.entries(model.rawAttributes)) {
      if (!columns[name]) await qi.addColumn(actualTable, name, columnDefinition(attribute, true));
    }
  }
  // Creates missing tables only. Never force/alter/drop existing tables.
  await sequelize.sync({ force: false, alter: false });
  // Tighten historic request links without deleting or nulling any records.
  if (tableMap.has('bloodrequests')) {
    const actual = tableMap.get('bloodrequests');
    for (const [column, reference] of [['userId', 'Users'], ['assignedDonorId', 'Donors']]) {
      const [orphans] = await sequelize.query(`SELECT id FROM BloodRequests WHERE \`${column}\` IS NOT NULL AND \`${column}\` NOT IN (SELECT id FROM \`${reference}\`) LIMIT 1`);
      if (orphans.length) throw new Error('Request relationships need a reviewed repair before adding retention constraints');
      const references = await qi.getForeignKeyReferencesForTable(actual);
      const constraints = references.filter(fk => fk.columnName === column);
      const [rules] = await sequelize.query('SELECT CONSTRAINT_NAME, DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND LOWER(TABLE_NAME) = LOWER(?)', { replacements: [database, actual] });
      if (constraints.length && constraints.every(fk => rules.some(rule => rule.CONSTRAINT_NAME === fk.constraintName && rule.DELETE_RULE === 'RESTRICT'))) continue;
      for (const fk of constraints) await qi.removeConstraint(actual, fk.constraintName);
      await qi.addConstraint(actual, { fields: [column], type: 'foreign key', name: `fk_requests_${column.toLowerCase()}_retained`, references: { table: reference, field: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
    }
  }
  for (const [table, name, fields] of indexDefinitions) {
    const indexes = await qi.showIndex(table);
    if (!indexes.some(index => index.name === name)) await qi.addIndex(table, fields, { name });
  }
  const requestTableExisted = tableMap.has('bloodrequests');
  if (requestTableExisted) {
    // Historical completion quantities/dates cannot be inferred from a status.
    await sequelize.models.BloodRequest.update({ unitsFulfilled: null }, { where: { status: 'fulfilled', unitsFulfilled: 0 } });
    const oldAppointments = await sequelize.models.BloodRequest.findAll({ where: { status: 'scheduled' } });
    for (const request of oldAppointments) {
      if (!request.scheduledDate || !request.assignedDonorId) continue;
      const existing = await sequelize.models.Appointment.findOne({ where: { requestId: request.id, status: 'scheduled' } });
      if (!existing) {
        await sequelize.models.Appointment.create({ requestId: request.id, donorId: request.assignedDonorId, scheduledDate: request.scheduledDate, createdBy: null, reason: 'Preserved legacy appointment; fresh confirmations required' });
        await request.update({ donorConfirmed: false, requesterConfirmed: false });
        await sequelize.models.WorkflowEvent.create({ requestId: request.id, actorId: null, action: 'legacy_appointment_preserved', reason: 'Fresh confirmations required after migration', details: { previousScheduledDate: request.scheduledDate } });
      }
    }
    await sequelize.models.ScheduleToken.update({ used: true }, { where: { used: false, [Op.or]: [{ appointmentId: null }, { recipientUserId: null }] } });
  }
  // No name-based facility backfill: an administrator must assign verified IDs.
  await SchemaMigration.create({ version: migrationVersions[0], appliedAt: new Date() });
  return inspectSchema();
}
export async function migrationCli() {
  try {
    if (!process.argv.includes('--apply')) {
      console.log(JSON.stringify(await inspectSchema(), null, 2));
      console.log('Read-only schema check. Apply with --apply --backup-confirmed after a verified backup.');
    } else console.log(JSON.stringify(await runMigrations({ backupConfirmed: process.argv.includes('--backup-confirmed') }), null, 2));
  } catch (error) { console.error('Migration failed:', error.message); process.exitCode = 1; }
  finally { await sequelize.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await migrationCli();
