import { searchTerm, withTextSearch, recordPage } from '../services/recordSearch.js';
import { Op } from 'sequelize';
import { BloodRequest } from '../models/bloodRequestModel.js';
import { Donor } from '../models/donorModel.js';
import { Pledge } from '../models/pledgeModel.js';
import { User } from '../models/userModel.js';
import { Appointment } from '../models/appointmentModel.js';
import { sequelize } from '../models/db.js';
import { reviewRequest } from '../services/requestLifecycleService.js';
import { unitsRemaining } from '../services/coordinationPolicy.js';
import { Facility } from '../models/facilityModel.js';
import { AuditService } from '../services/auditService.js';
import { validateEmail, getBcryptRounds } from '../middleware/validation.js';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';

export const patientRecordsPage = async (req, res) => {
  try {
    const account = await User.findByPk(req.session.userId);
    const filter = String(req.query.filter || '');
    const urgency = String(req.query.urgency || '');
    const scope = { archivedAt: null, [Op.or]: [{ userId: account.id }] };
    if (account.facilityId) scope[Op.or].push({ facilityId: account.facilityId, hospitalStatus: 'approved' });
    const where = { ...scope };
    if (['active', 'pending', 'scheduled', 'fulfilled', 'cancelled'].includes(filter)) where.status = filter;
    if (['critical', 'urgent', 'moderate'].includes(urgency)) where.urgency = urgency;
    const search = searchTerm(req.query);
    const searchedWhere = withTextSearch(where,search,['patientName','bloodType','hospitalName','city']);
    const { rows: requests, pagination } = await recordPage(BloodRequest,{ where: searchedWhere, order: [['createdAt', 'DESC']] },req.query,req.path);
    const ids = requests.map(r => r.id);
    const pledgeCounts = ids.length ? await Pledge.findAll({ attributes: ['requestId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']], where: { requestId: ids }, group: ['requestId'], raw: true }) : [];
    const appointments = ids.length ? await Appointment.findAll({ where: { requestId: ids, status: 'scheduled' }, include: [{ model: Donor, attributes: ['fullName', 'bloodType'] }] }) : [];
    const records = requests.map(r => { const a = appointments.find(a => a.requestId === r.id); return { ...r.toJSON(), unitsRemaining: unitsRemaining(r), pledgeCount: Number(pledgeCounts.find(p => p.requestId === r.id)?.count || 0), donorName: a?.Donor?.fullName || null, appointmentId: a?.id, version: a?.version, isOwn: r.userId === account.id }; });
    const summaryRows = await BloodRequest.findAll({ where: scope, attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']], group: ['status'], raw: true });
    const summary = { total: 0, active: 0, scheduled: 0, fulfilled: 0 };
    for (const row of summaryRows) { summary[row.status] = Number(row.count); summary.total += Number(row.count); }
    const pendingReview = account.facilityId ? await BloodRequest.findAll({ where: { facilityId: account.facilityId, status: 'pending', hospitalStatus: 'pending', archivedAt: null }, order: [['createdAt', 'ASC']], limit: 50 }) : [];
    const staff = account.facilityId ? await User.findAll({ where: { facilityId: account.facilityId, archivedAt: null }, attributes: ['id', 'firstName', 'lastName', 'email', 'isActive', 'emailVerified'], order: [['createdAt', 'ASC']], raw: true }) : [];
    res.render('hospital-patients', { title: 'Patient Records - VitalMatch', records, summary, facilityName: account.hospitalName, facilityAssigned: !!account.facilityId, pendingReview, filter, urgency, search, error: null, pagination, staff, myUserId: account.id });
  } catch (error) { console.error('Patient list failed:', error.name); res.status(503).render('hospital-patients', { title: 'Patient records unavailable', records: [], pendingReview: [], summary: {}, error: 'Patient records could not be loaded. Please retry.' }); }
};
// Invite a staff member to this facility. The account starts inactive and must
// be activated by an administrator; the staffer then sets a password via
// Forgot Password (no usable password is ever shared).
export const inviteStaff = async (req, res) => {
  try {
    const account = await User.findByPk(req.session.userId);
    if (!account.facilityId) {
      req.flash('error_msg', 'Your account is not linked to a verified facility yet.');
      return res.redirect('/hospital/patients');
    }
    const firstName = String(req.body.firstName || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    if (firstName.length < 2 || lastName.length < 2 || !validateEmail(email)) {
      req.flash('error_msg', 'Provide a valid staff name and email address.');
      return res.redirect('/hospital/patients');
    }
    if (await User.findOne({ where: { email } })) {
      req.flash('error_msg', 'That email address is already registered.');
      return res.redirect('/hospital/patients');
    }
    const placeholder = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), getBcryptRounds());
    const staff = await User.create({
      firstName, lastName, email, password: placeholder,
      phone: account.phone, address: account.address,
      dateOfBirth: '1990-01-01', gender: 'unspecified',
      role: 'hospital', hospitalName: account.hospitalName,
      facilityId: account.facilityId, isActive: false, emailVerified: false
    });
    await AuditService.logAction(account.id, 'hospital_invite_staff', 'Users', staff.id, null, { facilityId: account.facilityId, email }, {}).catch((e) => console.error('Audit log failed:', e.message));
    req.flash('success_msg', `Staff invitation created for ${email}. An administrator must activate the account; they can then set a password via Forgot Password.`);
    res.redirect('/hospital/patients');
  } catch (error) {
    console.error('Invite staff failed:', error.name);
    req.flash('error_msg', 'Could not invite staff. Please retry.');
    res.redirect('/hospital/patients');
  }
};
// Remove a staff member from this facility (deactivates; admin can re-enable).
export const deactivateStaff = async (req, res) => {
  try {
    const account = await User.findByPk(req.session.userId);
    const staff = await User.findByPk(req.params.id);
    if (!staff || !account.facilityId || staff.facilityId !== account.facilityId || staff.id === account.id) {
      req.flash('error_msg', 'Staff member not found in your facility.');
      return res.redirect('/hospital/patients');
    }
    await staff.update({ isActive: false });
    await AuditService.logAction(account.id, 'hospital_remove_staff', 'Users', staff.id, { isActive: true }, { isActive: false }, {}).catch((e) => console.error('Audit log failed:', e.message));
    req.flash('success_msg', 'Staff member removed from your facility.');
    res.redirect('/hospital/patients');
  } catch (error) {
    console.error('Remove staff failed:', error.name);
    req.flash('error_msg', 'Could not remove staff. Please retry.');
    res.redirect('/hospital/patients');
  }
};
export const exportPatientRecords = async (req, res) => {
  try {
    const account = await User.findByPk(req.session.userId);
    const scope = { archivedAt: null, [Op.or]: [{ userId: account.id }] };
    if (account.facilityId) scope[Op.or].push({ facilityId: account.facilityId, hospitalStatus: 'approved' });
    const rows = await BloodRequest.findAll({ where: scope, order: [['createdAt', 'DESC']], raw: true });
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ["Facility patient records," + new Date().toISOString().slice(0, 10), ""];
    lines.push("ID,Patient Reference,Patient,Blood Type,Units Required,Units Fulfilled,Urgency,Status,Hospital Status,City,Hospital,Created");
    rows.forEach(r => lines.push([r.id, r.patientReference, r.patientName, r.bloodType, r.unitsRequired, r.unitsFulfilled, r.urgency, r.status, r.hospitalStatus, r.city, r.hospitalName, r.createdAt].map(esc).join(",")));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="facility-patient-records.csv"');
    res.send(lines.join("\n"));
  } catch (error) {
    console.error("Patient records export failed:", error.name);
    res.status(500).json({ success: false, message: "Error exporting records" });
  }
};
async function decide(req, res, approved) {
  try {
    const request = await reviewRequest(req.params.id, req.session.userId, approved, req.body.declineReason || req.body.reason);
    req.flash('success_msg', approved ? 'Facility review approved. Donor coordination can begin.' : 'Request returned with a reason. The requester and coordinator were notified.');
    res.redirect('/hospital/patients');
  } catch (error) { req.flash('error_msg', error.status ? error.message : 'The review decision could not be saved.'); res.redirect('/hospital/patients'); }
}
export const approveRequest = (req, res) => decide(req, res, true);
export const declineRequest = (req, res) => decide(req, res, false);
