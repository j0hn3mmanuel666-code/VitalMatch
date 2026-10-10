import crypto from 'crypto';
import { Op } from 'sequelize';
import { BloodRequest } from '../models/bloodRequestModel.js';
import { User } from '../models/userModel.js';
import { Facility } from '../models/facilityModel.js';
import { Donor } from '../models/donorModel.js';
import { Appointment } from '../models/appointmentModel.js';
import { Fulfillment, WorkflowEvent } from '../models/workflowEventModel.js';
import { ScheduleToken, createScheduleToken } from '../models/scheduleTokenModel.js';
import { RequestAccess } from '../models/requestAccessModel.js';
import { Pledge, isCompatible } from '../models/pledgeModel.js';
import { UserSetting } from '../models/userSettingModel.js';
import { queueEmail, queueNotification } from './outboxService.js';
import { isDonorReady, unitsRemaining } from './coordinationPolicy.js';
import { queueCoordination } from './coordinationJobService.js';
import { isHospitalAccount } from './accountPolicy.js';
import { retryTransaction } from './transactionService.js';

export class WorkflowError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function positiveInteger(value, label, maximum = 10) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > maximum) throw new WorkflowError(`${label} must be an integer between 1 and ${maximum}`);
  return number;
}
function note(value, required = false) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (result.length > 2000 || (required && result.length < 3)) throw new WorkflowError('Provide a reason or completion note (3–2000 characters)');
  return result || null;
}
function operationKey(requestId, action, key, required = false) {
  if (!key) { if (required) throw new WorkflowError('Refresh this page before submitting this action'); return null; }
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(key)) throw new WorkflowError('Invalid operation key');
  return `${requestId}:${action}:${crypto.createHash('sha256').update(key).digest('hex')}`;
}
async function loadRequest(id, transaction) {
  const request = await BloodRequest.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!request || request.archivedAt) throw new WorkflowError('Request not found', 404);
  return request;
}
async function actorAccount(id, transaction, lock = false) {
  const actor = await User.findByPk(id, { transaction, ...(lock ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!actor || !actor.isActive || !actor.emailVerified) throw new WorkflowError('Your account cannot perform this action', 403);
  return actor;
}
async function event(request, actor, action, details, reason, key, transaction) {
  return WorkflowEvent.create({ requestId: request.id, actorId: actor.id, action, details, reason, operationKey: key }, { transaction });
}
async function replay(key, transaction) { return key && WorkflowEvent.findOne({ where: { operationKey: key }, transaction }); }
export async function notifyCoordinators(request, title, message, transaction) {
  const where = { isActive: true, [Op.or]: [{ role: 'admin' }] };
  if (request.facilityId) where[Op.or].push({ role: { [Op.in]: ['hospital', 'hospital_admin'] }, facilityId: request.facilityId });
  // Critical urgency jumps the queue: unmissable title + critical type so admin
  // UIs can banner it, and the caller triggers an immediate outbox run.
  const critical = (request.urgency || '').toLowerCase() === 'critical';
  const accounts = await User.findAll({ where, attributes: ['id'], transaction });
  for (const account of accounts) await queueNotification({ userId: account.id, title: critical ? `CRITICAL: ${title}` : title, message, type: critical ? 'critical' : 'info', link: `/view-blood-request/${request.id}` }, { transaction });
}
// Emergency escalation must ping staff directly: urgent in-app notice plus
// email to every admin and same-facility hospital account (honors each
// account's email preferences at send time).
export async function notifyEmergency(request, transaction) {
  const where = { isActive: true, [Op.or]: [{ role: 'admin' }] };
  if (request.facilityId) where[Op.or].push({ role: { [Op.in]: ['hospital', 'hospital_admin'] }, facilityId: request.facilityId });
  const accounts = await User.findAll({ where, attributes: ['id', 'email', 'firstName'], transaction });
  const message = `EMERGENCY: request #${request.id} (${request.bloodType}, ${request.unitsRequired} unit(s)) at ${request.hospitalName || request.city || 'unknown facility'} needs immediate action.`;
  for (const account of accounts) {
    await queueNotification({ userId: account.id, title: 'EMERGENCY escalation', message, type: 'critical', link: `/view-blood-request/${request.id}` }, { transaction });
    if (account.email) await queueEmail({ kind: 'request-update', recipient: account.email, dedupeKey: `emergency:${request.id}:${request.version}`, payload: { recipientName: account.firstName, title: 'EMERGENCY escalation', message, requestId: request.id, request: { id: request.id, actionPath: `/view-blood-request/${request.id}` } } }, { transaction });
  }
}
// Fire-and-forget immediate email dispatch for critical requests (the worker's
// normal 30s tick is too slow when blood is needed now). Safe to call after commit.
export function dispatchCriticalEmailsNow() {
  import('./emailOutboxWorker.js')
    .then(({ processEmailOutbox }) => processEmailOutbox({ maximum: 50 }))
    .catch((error) => console.error('Immediate critical email dispatch failed:', error.message));
}
async function informUser(userId, request, title, message, transaction, category = 'notifyAppointments', linkOverride = null) {
  if (!userId) return;
  const link = linkOverride || `/view-blood-request/${request.id}`;
  const prefs = await UserSetting.findOne({ where: { userId }, transaction });
  if (!prefs || prefs[category]) await queueNotification({ userId, title, message, type: 'info', link }, { transaction });
  if (!prefs || prefs.emailUpdates) {
    const user = await User.findByPk(userId, { attributes: ['email', 'firstName'], transaction });
    if (user) await queueEmail({ kind: 'request-update', recipient: user.email, payload: { recipientName: user.firstName, title, message, requestId: request.id, request: { id: request.id, actionPath: link } } }, { transaction });
  }
}
export async function invalidateScheduleTokens(requestId, transaction) {
  await ScheduleToken.update({ used: true }, { where: { bloodRequestId: requestId, used: false }, transaction });
}
async function cancelOpenAppointments(request, reason, transaction) {
  await Appointment.update({ status: 'cancelled', reason }, { where: { requestId: request.id, status: 'scheduled' }, transaction });
  await invalidateScheduleTokens(request.id, transaction);
}
async function assignableDonor(id, request, transaction, { completing = false } = {}) {
  if (!id) return null;
  const donor = await Donor.findByPk(positiveInteger(id, 'Donor', 2147483647), { transaction, lock: transaction.LOCK.UPDATE });
  const account = donor && await User.findByPk(donor.userId, { transaction });
  if (!donor || !account?.isActive || !account?.emailVerified || donor.userId === request.userId || !isCompatible(donor.bloodType, request.bloodType)) throw new WorkflowError('This donor cannot be assigned to this request');
  if (!completing && !isDonorReady(donor)) throw new WorkflowError('This donor is unavailable or waiting for the coordination interval');
  return donor;
}
async function scheduleNotices(request, appointment, donor, transaction) {
  const recipients = [{ role: 'requester', userId: request.userId }];
  if (donor) recipients.push({ role: 'donor', userId: donor.userId });
  for (const recipient of recipients) {
    if (!recipient.userId) continue;
    const account = await User.findByPk(recipient.userId, { attributes: ['id', 'email', 'firstName'], transaction });
    if (!account) continue;
    const token = await createScheduleToken(request.id, recipient.role, 168, { transaction, appointmentId: appointment.id, appointmentVersion: appointment.version, recipientUserId: account.id });
    const prefs = await UserSetting.findOne({ where: { userId: account.id }, transaction });
    if (!prefs || prefs.notifyAppointments) await queueNotification({ userId: account.id, title: 'Appointment needs confirmation', message: `Blood request #${request.id} has an appointment. Review the date and confirm your availability.`, type: 'info', link: `/confirm-schedule/${request.id}/${recipient.role}?appointment=${appointment.id}&version=${appointment.version}` }, { transaction });
    const donorView = recipient.role === 'donor';
    const snapshot = { id: request.id, bloodType: request.bloodType, hospitalName: request.hospitalName, city: request.city, unitsRequired: unitsRemaining(request) };
    if (!donorView) snapshot.contactPerson = request.contactPerson;
    if (!prefs || prefs.emailUpdates) await queueEmail({ kind: donorView ? 'donor-schedule' : 'requester-schedule', recipient: account.email, dedupeKey: `schedule:${appointment.id}:${appointment.version}:${recipient.role}`, payload: { request: snapshot, recipientName: account.firstName, scheduledDate: appointment.scheduledDate, notes: donorView ? '' : appointment.reason || '', confirmUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/schedule-confirm/${token.token}`, appointmentId: appointment.id, appointmentVersion: appointment.version } }, { transaction });
  }
}
export async function createRequest(data, actorId, submissionKey) {
  return retryTransaction(async transaction => {
    // Serialize submissions for this account so a replay sees the committed row.
    const actor = await actorAccount(actorId, transaction, true);
    const key = submissionKey ? `${actor.id}:${submissionKey}` : null;
    if (key) {
      if (!/^[a-zA-Z0-9:_-]{16,80}$/.test(key)) throw new WorkflowError('Refresh this form before submitting');
      const existing = await BloodRequest.findOne({ where: { submissionKey: key }, transaction });
      if (existing) return { request: existing, duplicate: true };
    }
    let facilityId = data.facilityId ? positiveInteger(data.facilityId, 'Facility', 2147483647) : null;
    if (isHospitalAccount(actor)) {
      if (!actor.facilityId) throw new WorkflowError('An administrator must assign your verified facility before you can submit requests', 403);
      if (facilityId && facilityId !== actor.facilityId) throw new WorkflowError('Select your assigned facility', 403);
      facilityId = actor.facilityId;
    }
    const facility = facilityId && await Facility.findByPk(facilityId, { transaction });
    if (facilityId && (!facility?.isActive || !facility?.verifiedAt)) throw new WorkflowError('Select an active verified facility');
    const hospitalApproved = actor.role === 'admin' || (isHospitalAccount(actor) && actor.facilityId === facilityId);
    const request = await BloodRequest.create({ ...data, facilityId, hospitalName: facility ? facility.hospitalName : data.hospitalName, hospitalId: isHospitalAccount(actor) ? actor.id : null, hospitalStatus: hospitalApproved ? 'approved' : 'pending', status: hospitalApproved ? 'active' : 'pending', userId: actor.id, createdBy: actor.id, submissionKey: key, unitsFulfilled: 0 }, { transaction });
    await event(request, actor, 'request_created', { status: request.status, facilityId, unitsRequired: request.unitsRequired }, null, null, transaction);
    await notifyCoordinators(request, hospitalApproved ? 'New blood request' : 'Request needs review', `Request #${request.id} needs ${hospitalApproved ? 'coordination' : 'facility or coordinator review'}.`, transaction);
    await queueCoordination(request, { transaction });
    return { request, duplicate: false };
  });
}
export async function scheduleRequest(requestId, actorId, data) {
  return retryTransaction(async transaction => {
    const request = await loadRequest(requestId, transaction);
    const actor = await actorAccount(actorId, transaction);
    if (actor.role !== 'admin') throw new WorkflowError('Only coordinators can schedule an appointment', 403);
    const key = operationKey(request.id, 'schedule', data.idempotencyKey, true);
    if (await replay(key, transaction)) return { request, duplicate: true };
    if (request.status !== 'active' || request.hospitalStatus !== 'approved' || unitsRemaining(request) < 1) throw new WorkflowError('Only reviewed active requests can be scheduled');
    const scheduledDate = new Date(data.scheduledDate);
    if (!Number.isFinite(scheduledDate.getTime()) || scheduledDate <= new Date()) throw new WorkflowError('Choose a future appointment date and time');
    const donor = await assignableDonor(data.donorId, request, transaction);
    if (!donor) throw new WorkflowError('Select a donor to schedule; record walk-in completion separately');
    const conflict = await Appointment.findOne({ where: { donorId: donor.id, status: 'scheduled' }, transaction, lock: transaction.LOCK.UPDATE });
    if (conflict) throw new WorkflowError('This donor already has a scheduled appointment');
    const appointment = await Appointment.create({ requestId: request.id, donorId: donor.id, scheduledDate, createdBy: actor.id, reason: note(data.notes) }, { transaction });
    await request.update({ status: 'scheduled', assignedDonorId: donor.id, scheduledDate, donorConfirmed: false, requesterConfirmed: false, fulfillmentNotes: note(data.notes), isEmergency: false, emergencyAt: null, emergencyExpiresAt: null, version: request.version + 1 }, { transaction });
    await event(request, actor, 'appointment_scheduled', { appointmentId: appointment.id, version: appointment.version, donorId: donor.id, scheduledDate }, note(data.notes), key, transaction);
    await scheduleNotices(request, appointment, donor, transaction);
    return { request, appointment };
  });
}
export async function fulfillRequest(requestId, actorId, data) {
  return retryTransaction(async transaction => {
    const request = await loadRequest(requestId, transaction);
    const actor = await actorAccount(actorId, transaction);
    if (actor.role !== 'admin') throw new WorkflowError('Only coordinators can record completion', 403);
    const key = operationKey(request.id, 'fulfill', data.idempotencyKey, true);
    if (await replay(key, transaction)) return { request, duplicate: true };
    if (!['active', 'scheduled'].includes(request.status) || request.hospitalStatus !== 'approved') throw new WorkflowError('This request is not open for completion');
    const units = positiveInteger(data.unitsProvided, 'Units provided');
    if (units > unitsRemaining(request)) throw new WorkflowError('Units provided exceed the outstanding request');
    let appointment = null;
    if (request.status === 'scheduled') {
      appointment = await Appointment.findOne({ where: { requestId: request.id, status: 'scheduled' }, transaction, lock: transaction.LOCK.UPDATE });
      if (!appointment || Number(data.appointmentId) !== appointment.id || Number(data.version) !== appointment.version) throw new WorkflowError('This appointment changed. Refresh before recording completion', 409);
      if (!appointment.donorConfirmed || !appointment.requesterConfirmed) throw new WorkflowError('Both parties must confirm before recording a scheduled completion');
      if (appointment.scheduledDate > new Date()) throw new WorkflowError('This appointment has not occurred yet');
    }
    const donorId = appointment ? appointment.donorId : data.donorId;
    const donor = await assignableDonor(donorId, request, transaction, { completing: !!appointment });
    const notes = note(data.notes, true);
    const completedAt = new Date();
    await Fulfillment.create({ requestId: request.id, appointmentId: appointment?.id, donorId: donor?.id, donorName: donor?.fullName, actorId: actor.id, unitsProvided: units, fulfilledAt: completedAt, notes, operationKey: key }, { transaction });
    const total = Number(request.unitsFulfilled || 0) + units;
    const complete = total >= request.unitsRequired;
    if (appointment) await appointment.update({ status: 'completed', reason: notes }, { transaction });
    await invalidateScheduleTokens(request.id, transaction);
    await request.update({ unitsFulfilled: total, fulfilledAt: complete ? completedAt : null, status: complete ? 'fulfilled' : 'active', assignedDonorId: complete ? donor?.id || null : null, scheduledDate: complete ? request.scheduledDate : null, requesterConfirmed: false, donorConfirmed: false, fulfillmentNotes: notes, isEmergency: false, emergencyAt: null, emergencyExpiresAt: null, version: request.version + 1 }, { transaction });
    if (donor) await donor.update({ lastDonationDate: completedAt, isAvailable: false }, { transaction });
    await event(request, actor, complete ? 'request_fulfilled' : 'request_partially_fulfilled', { unitsProvided: units, unitsFulfilled: total, donorId: donor?.id || null, donorName: donor?.fullName || 'Walk-in', appointmentId: appointment?.id || null, fulfilledAt: completedAt }, notes, key, transaction);
    await informUser(request.userId, request, complete ? 'Request fulfilled' : 'Partial fulfillment recorded', `Request #${request.id}: ${units} unit(s) recorded; ${unitsRemaining(request)} unit(s) remain.`, transaction);
    if (donor) await informUser(donor.userId, request, 'Donation recorded', `Your donation for request #${request.id} was recorded by a coordinator.`, transaction);
    await notifyCoordinators(request, complete ? 'Request fulfilled' : 'Request still needs blood', `Request #${request.id} has ${unitsRemaining(request)} outstanding unit(s).`, transaction);
    await queueCoordination(request, { transaction });
    return { request, complete };
  });
}
export async function changeAppointment(appointmentId, actorId, data, action) {
  return retryTransaction(async transaction => {
    // Lock the request before appointment/donor everywhere to preserve lock order.
    const lookup = await Appointment.findByPk(appointmentId, { transaction });
    if (!lookup) throw new WorkflowError('Appointment not found', 404);
    const request = await loadRequest(lookup.requestId, transaction);
    const appointment = await Appointment.findByPk(appointmentId, { transaction, lock: transaction.LOCK.UPDATE });
    const actor = await actorAccount(actorId, transaction);
    const donor = appointment.donorId && await Donor.findByPk(appointment.donorId, { transaction });
    const donorDecline = action === 'decline' && donor?.userId === actor.id;
    if (actor.role !== 'admin' && !donorDecline) throw new WorkflowError('You cannot change this appointment', 403);
    const key = operationKey(request.id, action, data.idempotencyKey);
    if (await replay(key, transaction)) return { request, appointment, duplicate: true };
    if (appointment.status !== 'scheduled' || request.status !== 'scheduled' || Number(data.version) !== appointment.version) throw new WorkflowError('This appointment changed. Refresh and try again', 409);
    const reason = note(data.reason, true);
    await invalidateScheduleTokens(request.id, transaction);
    if (action === 'reschedule') {
      const date = new Date(data.scheduledDate);
      if (!Number.isFinite(date.getTime()) || date <= new Date()) throw new WorkflowError('Choose a future appointment date and time');
      await appointment.update({ scheduledDate: date, version: appointment.version + 1, donorConfirmed: false, requesterConfirmed: false, reason }, { transaction });
      await request.update({ scheduledDate: date, donorConfirmed: false, requesterConfirmed: false, version: request.version + 1 }, { transaction });
      await scheduleNotices(request, appointment, donor, transaction);
    } else {
      await appointment.update({ status: action === 'decline' ? 'declined' : 'cancelled', reason, version: appointment.version + 1 }, { transaction });
      await request.update({ status: 'active', assignedDonorId: null, scheduledDate: null, donorConfirmed: false, requesterConfirmed: false, version: request.version + 1 }, { transaction });
      await informUser(request.userId, request, 'Appointment cancelled', `Appointment for request #${request.id} was cancelled: ${reason}. A coordinator will arrange the next step.`, transaction);
      if (donor && !donorDecline) await informUser(donor.userId, request, 'Appointment cancelled', `Your appointment for request #${request.id} was cancelled. The coordinator will arrange any next step.`, transaction, 'notifyAppointments', '/my-appointments');
    }
    await event(request, actor, `appointment_${action}`, { appointmentId: appointment.id, version: appointment.version }, reason, key, transaction);
    await notifyCoordinators(request, 'Appointment changed', `Request #${request.id}: ${action}. ${reason}`, transaction);
    if (action !== 'reschedule') await queueCoordination(request, { transaction, excludedUserIds: donorDecline ? [actor.id] : [] });
    return { request, appointment };
  });
}
export async function cancelRequest(requestId, actorId, reason) {
  return retryTransaction(async transaction => {
    const request = await loadRequest(requestId, transaction);
    const actor = await actorAccount(actorId, transaction);
    if (actor.role !== 'admin' && request.userId !== actor.id) throw new WorkflowError('You cannot cancel this request', 403);
    if (!['active', 'pending', 'scheduled'].includes(request.status)) throw new WorkflowError('Only an open request can be cancelled');
    const why = note(reason) || 'Cancelled by requester';
    const donor = request.assignedDonorId && await Donor.findByPk(request.assignedDonorId, { transaction });
    await cancelOpenAppointments(request, why, transaction);
    await request.update({ status: 'cancelled', donorConfirmed: false, requesterConfirmed: false, isEmergency: false, emergencyAt: null, emergencyExpiresAt: null, version: request.version + 1 }, { transaction });
    await event(request, actor, 'request_cancelled', { status: 'cancelled' }, why, null, transaction);
    if (donor) await informUser(donor.userId, request, 'Request cancelled', `Request #${request.id} was cancelled; your appointment is no longer active.`, transaction, 'notifyAppointments', '/my-appointments');
    await notifyCoordinators(request, 'Request cancelled', `Request #${request.id} was cancelled. ${why}`, transaction);
    return request;
  });
}
export async function reviewRequest(requestId, actorId, approved, reason) {
  return retryTransaction(async transaction => {
    const request = await loadRequest(requestId, transaction);
    const actor = await actorAccount(actorId, transaction);
    if (actor.role !== 'admin' && !(isHospitalAccount(actor) && actor.facilityId && actor.facilityId === request.facilityId)) throw new WorkflowError('This request is not assigned to your facility', 403);
    if (request.status !== 'pending' || !['pending', 'declined'].includes(request.hospitalStatus)) throw new WorkflowError('This request is not waiting for review');
    const why = note(reason, !approved);
    await request.update({ status: approved ? 'active' : 'pending', hospitalStatus: approved ? 'approved' : 'declined', hospitalId: isHospitalAccount(actor) ? actor.id : request.hospitalId, version: request.version + 1 }, { transaction });
    await event(request, actor, approved ? 'facility_approved' : 'facility_declined', { hospitalStatus: request.hospitalStatus }, why, null, transaction);
    await informUser(request.userId, request, approved ? 'Request approved' : 'Request needs correction', approved ? `Request #${request.id} is approved for donor coordination.` : `Request #${request.id} was returned for correction: ${why}. Open your request and choose Correct request to submit it for a fresh review.`, transaction, 'notifyMatches');
    await notifyCoordinators(request, approved ? 'Request approved' : 'Request needs follow-up', `Request #${request.id}: ${approved ? 'ready for coordination' : why}.`, transaction);
    if (approved) await queueCoordination(request, { transaction });
    return request;
  });
}
export async function correctRequest(requestId, actorId, data, version) {
  return retryTransaction(async transaction => {
    const request = await loadRequest(requestId, transaction);
    const actor = await actorAccount(actorId, transaction);
    if (request.userId !== actor.id) throw new WorkflowError('Only the requester can correct this request', 403);
    if (request.status !== 'pending' || request.hospitalStatus !== 'declined') throw new WorkflowError('Only a returned request can be corrected');
    if (Number(version) !== request.version) throw new WorkflowError('This request changed. Refresh before correcting it', 409);
    let facilityId = data.facilityId || null;
    if (isHospitalAccount(actor)) {
      if (!actor.facilityId || facilityId && Number(facilityId) !== actor.facilityId) throw new WorkflowError('Select your assigned verified facility', 403);
      facilityId = actor.facilityId;
    }
    const facility = facilityId && await Facility.findByPk(facilityId, { transaction });
    if (facilityId && (!facility?.isActive || !facility?.verifiedAt)) throw new WorkflowError('Select an active verified facility');
    const changedFields = Object.keys(data).filter(field => JSON.stringify(request[field]) !== JSON.stringify(data[field]));
    await request.update({ ...data, hospitalName: facility ? facility.hospitalName : data.hospitalName, facilityId, hospitalId: null, hospitalStatus: 'pending', version: request.version + 1 }, { transaction });
    await event(request, actor, 'request_corrected', { changedFields, facilityId }, 'Requester corrected a returned request; fresh review required', null, transaction);
    await notifyCoordinators(request, 'Corrected request needs review', `Request #${request.id} was corrected and needs a fresh review.`, transaction);
    return request;
  });
}
export async function confirmAppointment({ requestId, actorId, role, appointmentId, version, token }) {
  return retryTransaction(async transaction => {
    let record;
    if (token) {
      record = await ScheduleToken.findOne({ where: { token: crypto.createHash('sha256').update(token).digest('hex'), used: false }, transaction });
      if (!record || record.expiresAt <= new Date() || !record.appointmentId || !record.recipientUserId) throw new WorkflowError('This confirmation link has expired', 410);
      requestId = record.bloodRequestId; actorId = record.recipientUserId; role = record.role; appointmentId = record.appointmentId; version = record.appointmentVersion;
    }
    const request = await loadRequest(requestId, transaction);
    const actor = await actorAccount(actorId, transaction);
    const appointment = await Appointment.findByPk(appointmentId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!appointment || appointment.requestId !== request.id || appointment.status !== 'scheduled' || request.status !== 'scheduled' || appointment.version !== Number(version)) throw new WorkflowError('This appointment changed or is no longer scheduled', 410);
    const donor = appointment.donorId && await Donor.findByPk(appointment.donorId, { transaction });
    if (!['donor', 'requester'].includes(role) || (role === 'donor' ? donor?.userId !== actor.id : request.userId !== actor.id)) throw new WorkflowError('This confirmation belongs to someone else', 403);
    if (record) {
      const [used] = await ScheduleToken.update({ used: true }, { where: { id: record.id, used: false }, transaction });
      if (!used) throw new WorkflowError('This confirmation link was already used', 410);
    }
    const field = role === 'donor' ? 'donorConfirmed' : 'requesterConfirmed';
    if (!appointment[field]) {
      await appointment.update({ [field]: true }, { transaction });
      await request.update({ [field]: true }, { transaction });
      await event(request, actor, `${role}_confirmed`, { appointmentId: appointment.id, version: appointment.version }, null, null, transaction);
      await notifyCoordinators(request, 'Appointment confirmed', `${role === 'donor' ? 'Donor' : 'Requester'} confirmed request #${request.id}.`, transaction);
    }
    return { request, appointment, role };
  });
}
export async function canViewRequest(request, account, transaction) {
  if (!request || !account || !account.isActive || !account.emailVerified || account.archivedAt) return false;
  if (account.role === 'admin' || request.userId === account.id || (isHospitalAccount(account) && account.facilityId && account.facilityId === request.facilityId)) return true;
  if (!['active', 'scheduled', 'fulfilled', 'cancelled'].includes(request.status) || request.hospitalStatus !== 'approved') return false;
  const donor = await Donor.findOne({ where: { userId: account.id }, attributes: ['id'], transaction });
  if (donor && (await Appointment.findOne({ where: { requestId: request.id, donorId: donor.id, status: 'scheduled' }, attributes: ['id'], transaction }) || await Fulfillment.findOne({ where: { requestId: request.id, donorId: donor.id }, attributes: ['id'], transaction }))) return true;
  return !!(await RequestAccess.findOne({ where: { requestId: request.id, userId: account.id, expiresAt: { [Op.gt]: new Date() } }, transaction }));
}
export async function pledgeRequest(requestId, actorId, withdraw = false) {
  return retryTransaction(async transaction => {
    const request = await loadRequest(requestId, transaction);
    const actor = await actorAccount(actorId, transaction);
    if (withdraw) {
      const removed = await Pledge.destroy({ where: { requestId: request.id, userId: actor.id }, transaction });
      if (!removed) return request;
      await event(request, actor, 'pledge_withdrawn', {}, null, null, transaction);
      await notifyCoordinators(request, 'Pledge withdrawn', `A donor withdrew their pledge for request #${request.id}.`, transaction);
      await informUser(request.userId, request, 'Pledge withdrawn', `A donor withdrew from request #${request.id}.`, transaction, 'notifyMatches');
    } else {
      if (request.status !== 'active' || request.hospitalStatus !== 'approved' || !await canViewRequest(request, actor, transaction)) throw new WorkflowError('This request is not open to you for pledges', 403);
      const profile = await Donor.findOne({ where: { userId: actor.id }, transaction });
      const donor = profile && await assignableDonor(profile.id, request, transaction);
      if (!donor) throw new WorkflowError('Complete an available donor profile before pledging');
      const [pledge, created] = await Pledge.findOrCreate({ where: { requestId: request.id, userId: actor.id }, defaults: { bloodType: donor.bloodType }, transaction });
      if (!created) return request;
      await event(request, actor, 'pledge_created', { donorId: donor.id }, null, null, transaction);
      await informUser(request.userId, request, 'New donation pledge', `A donor offered to donate for request #${request.id}.`, transaction, 'notifyMatches');
      await notifyCoordinators(request, 'New donation pledge', `Request #${request.id} has a donor offer awaiting coordination.`, transaction);
    }
    return request;
  });
}
