import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { Appointment } from '../models/appointmentModel.js';
import { BloodRequest } from '../models/bloodRequestModel.js';
import { Donor } from '../models/donorModel.js';
import { Notification } from '../models/notificationModel.js';
import { Pledge, isCompatible } from '../models/pledgeModel.js';
import { getUserSettings } from '../models/userSettingModel.js';
import { User } from '../models/userModel.js';
import { canonicalRole } from '../services/accountPolicy.js';
import { isDonorReady, unitsRemaining } from '../services/coordinationPolicy.js';
import {
  cancelRequest,
  changeAppointment,
  confirmAppointment,
  createRequest,
  fulfillRequest,
  pledgeRequest,
  reviewRequest,
  scheduleRequest,
  WorkflowError,
  dispatchCriticalEmailsNow
} from '../services/requestLifecycleService.js';
import { normalizeRequestInput } from '../services/requestInputService.js';

const requestFields = [
  'id', 'userId', 'patientName', 'patientAge', 'bloodType', 'unitsRequired', 'unitsFulfilled',
  'hospitalName', 'hospitalAddress', 'city', 'province', 'contactPerson', 'contactNumber', 'email',
  'urgency', 'requiredByDate', 'notes', 'status', 'hospitalStatus', 'facilityId', 'isEmergency',
  'scheduledDate', 'requesterConfirmed', 'donorConfirmed', 'fulfilledAt', 'assignedDonorId', 'createdAt', 'version'
];

function requestCard(row, role, accountId, pledgeIds, pledgeCounts) {
  const item = row.toJSON();
  const isOwn = item.userId === accountId;
  const donorView = role === 'donor' && !isOwn;
  return {
    id: item.id,
    isOwn,
    patientName: donorView ? null : item.patientName,
    patientAge: donorView ? null : item.patientAge,
    bloodType: item.bloodType,
    unitsRequired: item.unitsRequired,
    unitsFulfilled: item.unitsFulfilled || 0,
    unitsRemaining: unitsRemaining(item),
    hospitalName: item.hospitalName,
    hospitalAddress: donorView ? null : item.hospitalAddress,
    city: item.city,
    province: item.province,
    contactPerson: donorView ? null : item.contactPerson,
    contactNumber: donorView ? null : item.contactNumber,
    email: donorView ? null : item.email,
    urgency: item.urgency,
    requiredByDate: item.requiredByDate,
    notes: donorView ? null : item.notes,
    status: item.status,
    hospitalStatus: item.hospitalStatus,
    facilityId: item.facilityId,
    isEmergency: !!item.isEmergency,
    scheduledDate: item.scheduledDate,
    requesterConfirmed: !!item.requesterConfirmed,
    donorConfirmed: !!item.donorConfirmed,
    createdAt: item.createdAt,
    version: item.version,
    hasPledged: pledgeIds.has(item.id),
    offerCount: donorView ? 0 : pledgeCounts.get(item.id) || 0,
    canReview: (role === 'admin' || (role === 'hospital' && !!item.facilityId)) && item.status === 'pending' && ['pending', 'declined'].includes(item.hospitalStatus),
    canCancel: role === 'admin' || isOwn,
  };
}

export async function getMobileWorkspace(req, res) {
  const accountId = req.authAccount.id;
  const user = await User.findByPk(accountId, {
    attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'hospitalName', 'facilityId']
  });
  if (!user) return res.status(401).json({ success: false, error: 'Authentication required' });
  const role = canonicalRole(user.role);

  let requestWhere = { archivedAt: null };
  if (role === 'donor') requestWhere = { ...requestWhere, status: 'active', hospitalStatus: 'approved' };
  else if (role === 'hospital') requestWhere = user.facilityId ? { ...requestWhere, facilityId: user.facilityId } : { ...requestWhere, userId: accountId };
  else if (role === 'user') requestWhere.userId = accountId;
  else requestWhere.status = { [Op.in]: ['pending', 'active', 'scheduled'] };

  let donor = null;
  if (role === 'donor') donor = await Donor.findOne({
    where: { userId: accountId },
    attributes: ['id', 'fullName', 'dateOfBirth', 'gender', 'bloodType', 'weight', 'height', 'mobileNumber', 'address', 'city', 'province', 'zipCode', 'latitude', 'longitude', 'lastDonationDate', 'medicalConditions', 'isAvailable', 'emergencyContactName', 'emergencyContactNumber', 'emergencyContactRelationship']
  });
  let rows = await BloodRequest.findAll({ where: requestWhere, attributes: requestFields, order: [['createdAt', 'DESC']], limit: 60 });
  if (role === 'donor' && donor) rows = rows.filter(row => isCompatible(donor.bloodType, row.bloodType) && unitsRemaining(row) > 0);
  if (role === 'donor' && !donor) rows = [];
  if (role === 'donor') {
    const ownRows = await BloodRequest.findAll({ where: { userId: accountId, archivedAt: null }, attributes: requestFields, order: [['createdAt', 'DESC']], limit: 20 });
    const matchedRows = donor ? await BloodRequest.findAll({
      where: { assignedDonorId: donor.id, archivedAt: null, status: { [Op.in]: ['scheduled', 'fulfilled'] } },
      attributes: requestFields,
      order: [['updatedAt', 'DESC']],
      limit: 20
    }) : [];
    const visibleIds = new Set([...ownRows, ...matchedRows].map(row => row.id));
    rows = [...ownRows, ...matchedRows, ...rows.filter(row => !visibleIds.has(row.id))].slice(0, 60);
  }

  const pledgeRows = rows.length
    ? await Pledge.findAll({ where: { requestId: { [Op.in]: rows.map(row => row.id) } }, attributes: ['requestId', 'userId'] })
    : [];
  const pledgeIds = new Set(pledgeRows.filter(row => row.userId === accountId).map(row => row.requestId));
  const pledgeCounts = new Map();
  for (const pledge of pledgeRows) pledgeCounts.set(pledge.requestId, (pledgeCounts.get(pledge.requestId) || 0) + 1);
  const requests = rows.map(row => {
    const item = requestCard(row, role, accountId, pledgeIds, pledgeCounts);
    if (role === 'hospital' && !user.facilityId) item.canReview = false;
    return item;
  });
  const requestIds = requests.map(row => row.id);

  let appointmentWhere = { status: { [Op.in]: ['scheduled', 'completed'] } };
  if (role === 'donor') appointmentWhere.donorId = donor?.id || -1;
  else appointmentWhere.requestId = { [Op.in]: requestIds.length ? requestIds : [-1] };
  const appointmentRows = await Appointment.findAll({
    where: appointmentWhere,
    include: [
      { model: BloodRequest, required: true, where: { archivedAt: null }, attributes: ['id', 'userId', 'bloodType', 'unitsRequired', 'unitsFulfilled', 'hospitalName', 'city', 'status'] },
      { model: Donor, required: false, attributes: ['id', 'fullName', 'bloodType'] }
    ],
    order: [['scheduledDate', 'ASC']],
    limit: 40
  });
  const appointments = appointmentRows.map(row => ({
    id: row.id,
    requestId: row.requestId,
    status: row.status,
    version: row.version,
    scheduledDate: row.scheduledDate,
    donorConfirmed: row.donorConfirmed,
    requesterConfirmed: row.requesterConfirmed,
    role: role === 'donor' ? 'donor' : row.BloodRequest.userId === accountId ? 'requester' : role,
    bloodType: row.BloodRequest.bloodType,
    unitsRemaining: unitsRemaining(row.BloodRequest),
    hospitalName: row.BloodRequest.hospitalName,
    city: row.BloodRequest.city,
    donorName: ['admin', 'hospital'].includes(role) ? row.Donor?.fullName || 'Unassigned' : null
  }));
  for (const request of requests) {
    const appointment = appointments.find(item => item.requestId === request.id);
    if (appointment) {
      request.appointmentId = appointment.id;
      request.appointmentVersion = appointment.version;
    }
  }

  const notifications = await Notification.findAll({
    where: { userId: accountId },
    attributes: ['id', 'title', 'message', 'type', 'isRead', 'link', 'createdAt'],
    order: [['createdAt', 'DESC']],
    limit: 20
  });
  const preferences = await getUserSettings(accountId);
  const metrics = {
    requestCount: requests.length,
    pendingRequests: requests.filter(row => row.status === 'pending').length,
    activeRequests: requests.filter(row => ['active', 'scheduled'].includes(row.status)).length,
    pendingReviews: requests.filter(row => row.canReview).length,
    appointments: appointments.length,
    unreadNotifications: notifications.filter(row => !row.isRead).length
  };
  const coordinationDonors = role === 'admin'
    ? (await Donor.findAll({
      where: { isAvailable: true },
      attributes: ['id', 'fullName', 'bloodType', 'dateOfBirth', 'lastDonationDate', 'isAvailable'],
      include: [{ model: User, required: true, attributes: [], where: { isActive: true, emailVerified: true, archivedAt: null } }],
      order: [['fullName', 'ASC']],
      limit: 80
    })).filter(donorRow => isDonorReady(donorRow)).map(donorRow => ({ id: donorRow.id, fullName: donorRow.fullName, bloodType: donorRow.bloodType }))
    : [];

  res.set('Cache-Control', 'private, no-store');
  res.json({
    success: true,
    account: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role,
      hospitalName: user.hospitalName,
      facilityId: user.facilityId
    },
    donor: donor ? donor.toJSON() : null,
    metrics,
    requests,
    coordinationDonors,
    appointments,
    notifications,
    preferences: {
      notifyMatches: preferences.notifyMatches,
      notifyAppointments: preferences.notifyAppointments,
      emailUpdates: preferences.emailUpdates
    }
  });
}

function sendActionError(res, error, fallback) {
  const status = error instanceof WorkflowError ? error.status : 500;
  res.status(status).json({ success: false, error: error instanceof WorkflowError ? error.message : fallback });
}

export async function createMobileRequest(req, res) {
  try {
    const data = normalizeRequestInput(req.body);
    const result = await createRequest(data, req.session.userId, req.body.submissionKey || crypto.randomUUID());
    if (!result.duplicate && String(result.request.urgency).toLowerCase() === 'critical') dispatchCriticalEmailsNow();
    res.status(result.duplicate ? 200 : 201).json({ success: true, id: result.request.id, status: result.request.status, message: result.duplicate ? 'Request already received.' : 'Request submitted.' });
  } catch (error) { sendActionError(res, error, 'The request could not be submitted.'); }
}

export async function pledgeMobileRequest(req, res) {
  try {
    if (canonicalRole(req.authAccount.role) !== 'donor') throw new WorkflowError('Donor accounts are required to pledge', 403);
    const request = await pledgeRequest(req.params.id, req.session.userId);
    res.json({ success: true, requestId: request.id, message: 'Your offer has been recorded.' });
  } catch (error) { sendActionError(res, error, 'The pledge could not be saved.'); }
}

export async function withdrawMobilePledge(req, res) {
  try {
    if (canonicalRole(req.authAccount.role) !== 'donor') throw new WorkflowError('Donor accounts are required to withdraw a pledge', 403);
    const request = await pledgeRequest(req.params.id, req.session.userId, true);
    res.json({ success: true, requestId: request.id, message: 'Your pledge was withdrawn.' });
  } catch (error) { sendActionError(res, error, 'The pledge could not be withdrawn.'); }
}

export async function cancelMobileRequest(req, res) {
  try {
    const request = await cancelRequest(req.params.id, req.session.userId, req.body.reason);
    res.json({ success: true, requestId: request.id, status: request.status, message: 'Request cancelled.' });
  } catch (error) { sendActionError(res, error, 'The request could not be cancelled.'); }
}

export async function reviewMobileRequest(req, res) {
  try {
    const { action, reason } = req.body;
    if (!['approve', 'decline'].includes(action)) throw new WorkflowError('Choose approve or decline');
    const request = await reviewRequest(req.params.id, req.session.userId, action === 'approve', reason);
    res.json({ success: true, requestId: request.id, status: request.status, hospitalStatus: request.hospitalStatus, message: action === 'approve' ? 'Request approved for coordination.' : 'Request returned with a reason.' });
  } catch (error) { sendActionError(res, error, 'The review decision could not be saved.'); }
}

export async function scheduleMobileRequest(req, res) {
  try {
    const result = await scheduleRequest(req.params.id, req.session.userId, req.body);
    res.json({ success: true, requestId: result.request.id, appointmentId: result.appointment?.id, message: 'Appointment saved. Both parties must confirm.' });
  } catch (error) { sendActionError(res, error, 'The appointment could not be scheduled.'); }
}

export async function fulfillMobileRequest(req, res) {
  try {
    const result = await fulfillRequest(req.params.id, req.session.userId, req.body);
    res.json({ success: true, requestId: result.request.id, complete: result.complete, message: result.duplicate ? 'This completion was already recorded.' : 'Completion recorded.' });
  } catch (error) { sendActionError(res, error, 'The completion could not be recorded.'); }
}

export async function confirmMobileAppointment(req, res) {
  try {
    const appointment = await Appointment.findByPk(req.params.id);
    if (!appointment) throw new WorkflowError('Appointment not found', 404);
    const request = await BloodRequest.findByPk(appointment.requestId, { attributes: ['id', 'userId'] });
    if (!request) throw new WorkflowError('Request not found', 404);
    let role = request.userId === req.session.userId ? 'requester' : '';
    if (!role) {
      const donor = await Donor.findByPk(appointment.donorId, { attributes: ['userId'] });
      if (donor?.userId === req.session.userId) role = 'donor';
    }
    if (!role) throw new WorkflowError('This appointment belongs to another account', 403);
    await confirmAppointment({ requestId: request.id, actorId: req.session.userId, role, appointmentId: appointment.id, version: req.body.version });
    res.json({ success: true, message: 'Appointment confirmed.' });
  } catch (error) { sendActionError(res, error, 'The appointment could not be confirmed.'); }
}

export async function declineMobileAppointment(req, res) {
  try {
    await changeAppointment(req.params.id, req.session.userId, req.body, 'decline');
    res.json({ success: true, message: 'Appointment declined. The coordinator has been notified.' });
  } catch (error) { sendActionError(res, error, 'The appointment could not be declined.'); }
}
