import { searchTerm, withTextSearch, recordPage } from '../services/recordSearch.js';
import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { BloodRequest } from '../models/bloodRequestModel.js';
import { User } from '../models/userModel.js';
import { Appointment } from '../models/appointmentModel.js';
import { Donor } from '../models/donorModel.js';
import { ScheduleToken } from '../models/scheduleTokenModel.js';
import { unitsRemaining } from '../services/coordinationPolicy.js';
import { confirmAppointment, changeAppointment, WorkflowError } from '../services/requestLifecycleService.js';

const state = (request, appointment, role, postUrl) => ({ title: 'Confirm Appointment - VitalMatch', role, request: { ...request.toJSON(), patientName: null, patientAge: null, indicationOfTransfusion: null, notes: null, fulfillmentNotes: null, email: null, contactPerson: null, contactNumber: null, scheduledDate: appointment.scheduledDate }, appointmentId: appointment.id, version: appointment.version, confirmed: false, alreadyConfirmed: role === 'donor' ? appointment.donorConfirmed : appointment.requesterConfirmed, postUrl, token: null });
async function ownedAppointment(req) {
  const request = await BloodRequest.findByPk(req.params.id);
  const role = req.params.role;
  if (!request || request.status !== 'scheduled' || request.archivedAt || !['donor', 'requester'].includes(role)) throw new WorkflowError('This appointment is no longer available', 410);
  const where = { requestId: request.id, status: 'scheduled' };
  const suppliedId = req.body?.appointmentId || req.query.appointment;
  if (suppliedId) where.id = Number(suppliedId);
  const appointment = await Appointment.findOne({ where });
  if (!appointment) throw new WorkflowError('This appointment changed. Open its current confirmation link.', 410);
  const donor = appointment.donorId && await Donor.findByPk(appointment.donorId);
  if (role === 'donor' ? donor?.userId !== req.session.userId : request.userId !== req.session.userId) throw new WorkflowError('This appointment belongs to someone else', 403);
  return { request, appointment, role };
}
function failure(res, error) {
  return res.status(error.status || 500).render('schedule-confirmed', { title: 'Appointment unavailable', invalid: true, message: error.status ? error.message : 'Could not load this appointment. Please retry.' });
}
export const confirmSchedulePage = async (req, res) => {
  try {
    const { request, appointment, role } = await ownedAppointment(req);
    if (req.query.version && Number(req.query.version) !== appointment.version) throw new WorkflowError('The appointment changed. Open the latest confirmation notice.', 410);
    res.render('schedule-confirmed', state(request, appointment, role, '/confirm-schedule/' + request.id + '/' + role));
  } catch (error) { failure(res, error); }
};
export const confirmScheduleSubmit = async (req, res) => {
  try {
    const { request, appointment, role } = await confirmAppointment({ requestId: Number(req.params.id), actorId: req.session.userId, role: req.params.role, appointmentId: Number(req.body.appointmentId), version: Number(req.body.version) });
    res.render('schedule-confirmed', { ...state(request, appointment, role, '/confirm-schedule/' + request.id + '/' + role), confirmed: true });
  } catch (error) { failure(res, error); }
};
export const donorAppointmentsPage = async (req, res) => {
  try {
    const donor = await Donor.findOne({ where: { userId: req.session.userId } });
    if (!donor) { req.flash('error_msg', 'Complete a donor profile to manage appointments.'); return res.redirect('/donor-profile'); }
    const search = searchTerm(req.query);
    const { rows, pagination } = await recordPage(Appointment, { where: withTextSearch({ donorId: donor.id, status: 'scheduled' },search,['$BloodRequest.hospitalName$','$BloodRequest.bloodType$','$BloodRequest.city$'], 'requestId'), include: [{ model: BloodRequest, required: true, where: { archivedAt: null } }], order: [['scheduledDate', 'ASC']] },req.query,req.path);
    const appointments = rows.map(a => ({ ...a.BloodRequest.toJSON(), patientName: null, patientAge: null, indicationOfTransfusion: null, notes: null, fulfillmentNotes: null, email: null, contactPerson: null, contactNumber: null, reason: null, id: a.requestId, appointmentId: a.id, version: a.version, scheduledDate: a.scheduledDate, donorConfirmed: a.donorConfirmed, requesterConfirmed: a.requesterConfirmed, unitsRemaining: unitsRemaining(a.BloodRequest) }));
    res.render('my-appointments', { title: 'My Appointments - VitalMatch', donor: donor.toJSON(), appointments, pagination, search, error: null });
  } catch (error) { res.status(503).render('my-appointments', { title: 'Appointments unavailable', appointments: [], error: 'Appointments could not be loaded. Please retry.' }); }
};
export const hospitalAppointmentsPage = async (req, res) => {
  try {
    const account = await User.findByPk(req.session.userId);
    if (!account.facilityId) { req.flash('error_msg', 'An administrator must assign your verified facility first.'); return res.redirect('/hospital/patients'); }
    const search = searchTerm(req.query);
    const { rows, pagination } = await recordPage(Appointment, { where: withTextSearch({ status: 'scheduled' }, search, ['$BloodRequest.hospitalName$', '$BloodRequest.bloodType$', '$BloodRequest.city$', '$Donor.fullName$'], 'requestId'), include: [{ model: BloodRequest, required: true, where: { facilityId: account.facilityId, archivedAt: null } }, { model: Donor, attributes: ['id', 'fullName', 'bloodType'] }], order: [['scheduledDate', 'ASC']] }, req.query, req.path);
    const appointments = rows.map(a => ({ id: a.requestId, appointmentId: a.id, version: a.version, scheduledDate: a.scheduledDate, donorConfirmed: a.donorConfirmed, requesterConfirmed: a.requesterConfirmed, donorName: a.Donor ? a.Donor.fullName : 'Unassigned', donorBloodType: a.Donor ? a.Donor.bloodType : null, bloodType: a.BloodRequest.bloodType, hospitalName: a.BloodRequest.hospitalName, city: a.BloodRequest.city, unitsRequired: a.BloodRequest.unitsRequired }));
    res.render('hospital-appointments', { title: 'Facility Appointments - VitalMatch', appointments, pagination, search, error: null });
  } catch (error) { res.status(503).render('hospital-appointments', { title: 'Appointments unavailable', appointments: [], error: 'Appointments could not be loaded. Please retry.' }); }
};
export const declineAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findOne({ where: { requestId: req.params.id, status: 'scheduled' } });
    if (!appointment) throw new WorkflowError('Appointment not found', 404);
    const result = await changeAppointment(appointment.id, req.session.userId, { ...req.body, reason: req.body.reason || 'Donor declined the appointment' }, 'decline');
    req.flash('success_msg', 'Appointment declined. The coordinator has been notified and donor outreach is queued.');
    res.redirect('/my-appointments');
  } catch (error) { req.flash('error_msg', error.status ? error.message : 'Could not decline this appointment.'); res.redirect('/my-appointments'); }
};
async function tokenAppointment(token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) throw new WorkflowError('This link is invalid or expired', 410);
  const record = await ScheduleToken.findOne({ where: { token: crypto.createHash('sha256').update(token).digest('hex'), used: false, expiresAt: { [Op.gt]: new Date() } } });
  if (!record?.appointmentId || !record.recipientUserId) throw new WorkflowError('This confirmation link expired. Open the current appointment.', 410);
  const request = await BloodRequest.findByPk(record.bloodRequestId);
  const appointment = await Appointment.findByPk(record.appointmentId);
  if (!request || request.archivedAt || request.status !== 'scheduled' || !appointment || appointment.status !== 'scheduled' || appointment.version !== record.appointmentVersion) throw new WorkflowError('This appointment changed or was cancelled', 410);
  return { request, appointment, record };
}
export const confirmByTokenPage = async (req, res) => {
  try {
    const { request, appointment, record } = await tokenAppointment(req.params.token);
    res.render('schedule-confirmed', { ...state(request, appointment, record.role, '/schedule-confirm/' + req.params.token), token: req.params.token });
  } catch (error) { failure(res, error); }
};
export const confirmByTokenSubmit = async (req, res) => {
  try {
    const { request, appointment, role } = await confirmAppointment({ token: req.params.token });
    res.render('schedule-confirmed', { ...state(request, appointment, role, '/schedule-confirm/' + req.params.token), confirmed: true, token: req.params.token });
  } catch (error) { failure(res, error); }
};
