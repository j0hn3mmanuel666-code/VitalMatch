import { User } from '../models/userModel.js';
import { Donor } from '../models/donorModel.js';
import { BloodRequest } from '../models/bloodRequestModel.js';
import { PasswordReset } from '../models/passwordResetModel.js';
import { AuditService } from './auditService.js';
import { sequelize } from '../models/db.js';
import { Op, fn, col } from 'sequelize';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { getBcryptRounds, validateEmail, validatePhoneNumber } from '../middleware/validation.js';
import { paginationFor } from './pagination.js';
import { resolveAdminFacility } from './facilityService.js';
import { Facility } from '../models/facilityModel.js';
import { getRuntimeSettings } from './runtimeSettings.js';
import { parseBirthDate } from './coordinationPolicy.js';
import { retryTransaction } from './transactionService.js';
const SECRET_FIELDS = ['password','emailVerificationToken','emailVerificationExpires'];
const FIELDS = ['firstName','lastName','email','phone','address','dateOfBirth','gender','role','hospitalName','facilityId','isActive','emailVerified'];
const normalizedRole = role => role === 'hospital_admin' ? 'hospital' : role;
export const csvCell = value => {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
const safeUser = user => { const result = user.toJSON(); for (const f of SECRET_FIELDS) delete result[f]; return result; };
export class UserService {
  static async getUserList(filters = {}, pagination = {}) {
    const where = {};
    if (typeof filters.search === 'string' && filters.search) where[Op.or] = ['firstName','lastName','email'].map(f => ({ [f]: { [Op.like]: `%${filters.search.slice(0,200)}%` } }));
    if (filters.role) where.role = normalizedRole(filters.role) === 'hospital' ? { [Op.in]: ['hospital', 'hospital_admin'] } : normalizedRole(filters.role);
    if (filters.status === 'active') where.isActive = true;
    if (filters.status === 'inactive') where.isActive = false;
    if (filters.status === 'archived') where.archivedAt = { [Op.ne]: null };
    if (filters.dateRange?.start && filters.dateRange?.end) where.createdAt = { [Op.between]: [new Date(filters.dateRange.start), new Date(filters.dateRange.end)] };
    const count = await User.count({ where });
    const paging = paginationFor(pagination, count);
    const [field, direction] = String(pagination.sort || 'createdAt DESC').split(' ');
    const sortField = ['id','firstName','lastName','email','role','createdAt'].includes(field) ? field : 'createdAt';
    const users = await User.findAll({ where, limit: paging.limit, offset: paging.offset, order: [[sortField, direction?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC']], attributes: { exclude: SECRET_FIELDS } });
    const ids = users.map(u => u.id);
    const [donors, requests] = ids.length ? await Promise.all([
      Donor.findAll({ where: { userId: ids }, attributes: ['userId'], raw: true }),
      BloodRequest.findAll({ where: { userId: ids }, attributes: ['userId', [fn('COUNT', col('id')), 'count']], group: ['userId'], raw: true })
    ]) : [[], []];
    const donorIds = new Set(donors.map(d => d.userId)), requestCounts = new Map(requests.map(r => [r.userId, Number(r.count)]));
    return { users: users.map(u => ({ ...safeUser(u), isDonor: donorIds.has(u.id), bloodRequestCount: requestCounts.get(u.id) || 0, lastLoginAt: u.lastLoginAt || null })), pagination: { ...paging, currentPage: paging.page, totalCount: count, hasNextPage: paging.hasNext, hasPrevPage: paging.hasPrev } };
  }
  static async getUserById(id) {
    const user = await User.findByPk(id, { attributes: { exclude: SECRET_FIELDS } });
    if (!user) throw new Error('User not found');
    if (user.facilityId) {
      const facility = await Facility.findByPk(user.facilityId, { attributes: ['latitude', 'longitude'] });
      if (facility) { user.setDataValue('facilityLatitude', facility.latitude); user.setDataValue('facilityLongitude', facility.longitude); }
    }
    const [donor, requests] = await Promise.all([Donor.findOne({ where: { userId: id } }), BloodRequest.findAll({ where: { userId: id }, order: [['createdAt','DESC']], limit: 10 })]);
    return { ...safeUser(user), donorProfile: donor?.toJSON() || null, recentBloodRequests: requests.map(r => r.toJSON()), isDonor: !!donor };
  }
  static input(data) {
    const out = Object.fromEntries(FIELDS.filter(f => data[f] !== undefined).map(f => [f,data[f]]));
    if (out.role !== undefined) {
      out.role = normalizedRole(out.role);
      if (!['user','donor','hospital','admin'].includes(out.role)) throw new Error('Invalid role');
    }
    for (const f of ['isActive','emailVerified']) if (out[f] !== undefined) {
      if (![true,false,'true','false'].includes(out[f])) throw new Error(`Invalid ${f}`);
      out[f] = out[f] === true || out[f] === 'true';
    }
    for (const f of ['firstName','lastName','email','phone','address','dateOfBirth','gender','hospitalName']) if (out[f] !== undefined && out[f] !== null && typeof out[f] !== 'string') throw new Error(`Invalid ${f}`);
    for (const [field,max] of Object.entries({firstName:100,lastName:100,email:254,phone:24,address:2000,dateOfBirth:10,gender:30,hospitalName:255})) {
      if (out[field] === undefined) continue;
      if (out[field] === null && field === 'hospitalName') continue;
      if (typeof out[field] !== 'string' || out[field].trim().length < (['firstName','lastName','address'].includes(field) ? 2 : 1) || out[field].length > max) throw new Error(`Invalid ${field}`);
      out[field] = out[field].trim();
    }
    if (out.email) out.email = out.email.trim().toLowerCase();
    if (out.email !== undefined && !validateEmail(out.email)) throw new Error('Invalid email');
    if (out.phone !== undefined && !validatePhoneNumber(out.phone)) throw new Error('Invalid phone');
    if (out.dateOfBirth !== undefined && (!parseBirthDate(out.dateOfBirth) || parseBirthDate(out.dateOfBirth) > new Date())) throw new Error('Invalid dateOfBirth');
    if (out.facilityId !== undefined && out.facilityId !== null && out.facilityId !== '' && (!/^\d+$/.test(String(out.facilityId)) || Number(out.facilityId) < 1)) throw new Error('Invalid facility');
    return out;
  }
  static async protectLastAdmin(user, values, transaction) {
    if (!(user.role === 'admin' && user.isActive && user.emailVerified && !user.archivedAt && (values.isActive === false || values.emailVerified === false || (values.role && values.role !== 'admin')))) return;
    const admins = await User.findAll({ where: { role: 'admin', isActive: true, emailVerified: true, archivedAt: null }, transaction, lock: transaction.LOCK.UPDATE });
    if (user.role === 'admin' && user.isActive && user.emailVerified && !user.archivedAt && (values.isActive === false || values.emailVerified === false || (values.role && values.role !== 'admin')) && admins.length <= 1) throw new Error('At least one active verified administrator must remain');
  }
  static async createUser(data, adminId, context = {}) {
    const values = this.input(data);
    if (!['firstName','lastName','email','phone','address','dateOfBirth','gender'].every(k => values[k])) throw new Error('All required fields must be provided');
    const tempPassword = this.generateTemporaryPassword();
    const password = await bcrypt.hash(tempPassword, getBcryptRounds());
    const user = await retryTransaction(async transaction => {
      if (['hospital'].includes(values.role)) { const facility = await resolveAdminFacility({ ...values, adminId }, transaction); values.facilityId = facility.id; values.hospitalName = facility.hospitalName; }
      else values.facilityId = null;
      const created = await User.create({ ...values, role: values.role || 'user', password, isActive: values.isActive ?? true, emailVerified: values.emailVerified ?? true }, { transaction });
      await AuditService.logAction(adminId, 'USER_CREATE', 'Users', created.id, null, values, { ...context, transaction });
      return created;
    });
    return { user: safeUser(user), tempPassword };
  }
  static async updateUser(id, data, adminId, context = {}) {
    return retryTransaction(async transaction => {
      const user = await User.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!user) throw new Error('User not found');
      // Internal CLI repairs can require a narrowly defined target identity
      // within this same lock. HTTP callers cannot supply this callback.
      if (context.validateTarget) await context.validateTarget(user, transaction);
      const values = this.input(data);
      if (user.archivedAt && values.isActive === true) throw new Error('Archived accounts require a reviewed restoration procedure');
      await this.protectLastAdmin(user, values, transaction);
      const role = values.role || normalizedRole(user.role);
      if (user.role === 'hospital_admin' && values.role === undefined) values.role = 'hospital';
      if (role === 'hospital' && (values.facilityId !== undefined || values.hospitalName !== undefined || !user.facilityId)) { const facility = await resolveAdminFacility({ facilityId: values.facilityId, hospitalName: values.hospitalName || user.hospitalName, adminId, latitude: data.facilityLatitude, longitude: data.facilityLongitude }, transaction); values.facilityId = facility.id; values.hospitalName = facility.hospitalName; }
      else if (role !== 'hospital') values.facilityId = null;
      const changes = this.detectChanges(user.toJSON(), values);
      if (!Object.keys(changes).length) return { user: safeUser(user), changes };
      if (['role','isActive','email','facilityId','emailVerified'].some(f => changes[f])) {
        values.authVersion = user.authVersion + 1;
        await PasswordReset.update({ used: true }, { where: { email: user.email, used: false }, transaction });
      }
      // A verification link delivered to the previous address cannot verify a
      // replacement address. Preserve the administrator's explicit verified state.
      if (changes.email || changes.emailVerified) { values.emailVerificationToken = null; values.emailVerificationExpires = null; }
      await user.update(values, { transaction });
      await AuditService.logAction(adminId, 'USER_UPDATE', 'Users', user.id, Object.fromEntries(Object.entries(changes).map(([k,v]) => [k,v.old])), values, { ...context, transaction });
      return { user: safeUser(user), changes };
    });
  }
  static async deleteUser(id, adminId, context = {}) {
    if (Number(id) === Number(adminId)) throw new Error('You cannot archive your own account');
    await retryTransaction(async transaction => {
      const user = await User.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!user) throw new Error('User not found');
      await this.protectLastAdmin(user, { isActive: false }, transaction);
      if (user.archivedAt) return;
      await PasswordReset.update({ used: true }, { where: { email: user.email, used: false }, transaction });
      await user.update({ isActive: false, archivedAt: new Date(), authVersion: user.authVersion + 1 }, { transaction });
      await Donor.update({ isAvailable: false }, { where: { userId: id }, transaction });
      await AuditService.logAction(adminId, 'USER_ARCHIVE', 'Users', user.id, { isActive: true }, { isActive: false, archivedAt: user.archivedAt }, { ...context, transaction });
    });
    return true;
  }
  static async updateUserRole(userId, role, adminId, context = {}) {
    const result = await this.updateUser(userId, { role }, adminId, context);
    return { ...result, changed: !!result.changes.role, oldRole: result.changes.role?.old, newRole: result.user.role };
  }
  static async resetPassword(id, adminId, context = {}) {
    const tempPassword = this.generateTemporaryPassword(), password = await bcrypt.hash(tempPassword, getBcryptRounds());
    await retryTransaction(async transaction => {
      const user = await User.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!user || user.archivedAt) throw new Error('Active account not found');
      await PasswordReset.update({ used: true }, { where: { email: user.email, used: false }, transaction });
      await user.update({ password, authVersion: user.authVersion + 1 }, { transaction });
      await AuditService.logAction(adminId, 'PASSWORD_RESET', 'Users', user.id, null, { password: '[redacted]' }, { ...context, transaction });
    });
    return tempPassword;
  }
  static async getUserStatistics() {
    const [totalUsers, activeUsers, adminUsers, hospitalAdmins, donorCount, requestCount] = await Promise.all([
      User.count(), User.count({ where: { isActive: true, archivedAt: null } }), User.count({ where: { role: 'admin' } }), User.count({ where: { role: { [Op.in]: ['hospital','hospital_admin'] } } }), Donor.count(), BloodRequest.count()
    ]);
    return { totalUsers, activeUsers, adminUsers, hospitalAdmins, donorCount, requestCount, donorPercentage: totalUsers ? Math.round(donorCount/totalUsers*100) : 0 };
  }
  static async searchUsers(query, filters = {}) { return (await this.getUserList({ ...filters, search: query }, { limit: 50 })).users; }
  static generateTemporaryPassword(policy = getRuntimeSettings().security) {
    const length = Math.max(28, Math.min(64, Number(policy.minPasswordLength) || 8));
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@$!%*?&';
    const characters = ['A','a','1','!'];
    while (characters.length < length) characters.push(alphabet[crypto.randomInt(alphabet.length)]);
    for (let i = characters.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [characters[i], characters[j]] = [characters[j], characters[i]]; }
    return characters.join('');
  }
  static detectChanges(old, data) { return Object.fromEntries(FIELDS.filter(f => data[f] !== undefined && data[f] !== old[f]).map(f => [f,{ old: old[f], new: data[f] }])); }
  static async exportUsersToCSV(filters = {}) {
    const lines = [['ID','First Name','Last Name','Email','Phone','Role','Is Donor','Blood Requests','Created At'].map(csvCell).join(',')];
    let page = 1, next;
    do {
      const result = await this.getUserList(filters, { page, limit: 100, sort: 'id ASC' });
      for (const u of result.users) lines.push([u.id,u.firstName,u.lastName,u.email,u.phone,u.role,u.isDonor ? 'Yes':'No',u.bloodRequestCount,u.createdAt].map(csvCell).join(','));
      next = result.pagination.hasNext; page++;
    } while (next);
    return lines.join('\r\n') + '\r\n';
  }
}
