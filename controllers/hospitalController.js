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

export const patientRecordsPage = async (req, res) => {
  try {
    const account = await User.findByPk(req.session.userId);
    const filter = String(req.query.filter || '');
    const scope = { archivedAt: null, [Op.or]: [{ userId: account.id }] };
    if (account.facilityId) scope[Op.or].push({ facilityId: account.facilityId, hospitalStatus: 'approved' });
    const where = { ...scope };
    if (['active', 'pending', 'scheduled', 'fulfilled', 'cancelled'].includes(filter)) where.status = filter;
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
    res.render('hospital-patients', { title: 'Patient Records - VitalMatch', records, summary, facilityName: account.hospitalName, facilityAssigned: !!account.facilityId, pendingReview, filter, search, error: null, pagination });
  } catch (error) { console.error('Patient list failed:', error.name); res.status(503).render('hospital-patients', { title: 'Patient records unavailable', records: [], pendingReview: [], summary: {}, error: 'Patient records could not be loaded. Please retry.' }); }
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
