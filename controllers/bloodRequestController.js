import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { BloodRequest } from '../models/bloodRequestModel.js';
import { User } from '../models/userModel.js';
import { Donor } from '../models/donorModel.js';
import { Pledge, isCompatible } from '../models/pledgeModel.js';
import { Appointment } from '../models/appointmentModel.js';
import { WorkflowEvent } from '../models/workflowEventModel.js';
import { listFacilities } from '../services/facilityService.js';
import { createRequest, correctRequest, canViewRequest, pledgeRequest, dispatchCriticalEmailsNow, notifyEmergency, WorkflowError } from '../services/requestLifecycleService.js';
import { normalizeRequestInput } from '../services/requestInputService.js';
import { isDonorReady, unitsRemaining } from '../services/coordinationPolicy.js';
import { queueCoordination } from '../services/coordinationJobService.js';
import { isHospitalAccount } from '../services/accountPolicy.js';
import { findNearestDonors } from '../services/matchingService.js';
import { retryTransaction } from '../services/transactionService.js';

async function requestForm(req, res, view = 'request-blood') {
  const profile = await User.findByPk(req.session.userId);
  const submissionKey = req.session.requestSubmissionKey ||= crypto.randomUUID();
  let formValues = req.session.requestFormValues || { submissionKey };
  let editRequestId = null;
  if (req.params.id) {
    const request = await BloodRequest.findOne({ where: { id: req.params.id, userId: req.session.userId, status: 'pending', hospitalStatus: 'declined', archivedAt: null } });
    if (!request) throw new WorkflowError('Only your returned requests can be corrected', 404);
    editRequestId = request.id;
    if (!req.session.requestFormValues) {
      formValues = { ...request.toJSON(), version: request.version, bloodComponents: (request.bloodComponents || []).map(c => c.type), requiredByDate: new Date(request.requiredByDate).toISOString().slice(0, 10) };
      for (const component of request.bloodComponents || []) formValues[component.type + 'Volume'] = component.volume;
    }
  }
  delete req.session.requestFormValues;
  res.render(view, { title: editRequestId ? 'Correct Returned Request - VitalMatch' : 'Request Blood - VitalMatch', profile: profile?.toJSON(), facilities: await listFacilities(), editRequestId, formAction: editRequestId ? '/requests/' + editRequestId + '/correct' : '/request-blood', formValues, formValuesJson: JSON.stringify(formValues).replace(/</g, '\\u003c') });
}
export const requestBloodPage = (req, res) => requestForm(req, res);
export const newRequestBloodPage = requestBloodPage;
export const simpleRequestBloodPage = requestBloodPage;
export const editBloodRequestPage = requestBloodPage;

export const viewBloodRequestPage = async (req, res) => {
  try {
    const account = await User.findByPk(req.session.userId);
    const request = await BloodRequest.findByPk(req.params.id);
    if (!request || !await canViewRequest(request, account)) return res.status(404).render('404', { title: 'Request unavailable', message: 'The request is unavailable or you do not have permission to view it.' });
    const isOwner = request.userId === account.id;
    const isAdmin = account.role === 'admin';
    const facilityView = isHospitalAccount(account) && account.facilityId && account.facilityId === request.facilityId;
    const privateView = isOwner || isAdmin || facilityView;
    const canReviewHospital = !!facilityView && request.status === 'pending' && ['pending', 'declined'].includes(request.hospitalStatus);
    const pledgeCount = await Pledge.count({ where: { requestId: request.id } });
    let pledges = [], pledgeState = 'hidden';
    if (isOwner || isAdmin || facilityView) {
      const rows = await Pledge.findAll({ where: { requestId: request.id }, include: [{ model: User, attributes: ['id', 'firstName', 'lastName'] }], order: [['createdAt', 'ASC']] });
      const profiles = rows.length ? await Donor.findAll({ where: { userId: rows.map(r => r.userId) }, attributes: ['id', 'userId'] }) : [];
      const byUser = new Map(profiles.map(d => [d.userId, d.id]));
      pledges = rows.map(r => ({ name: r.User.firstName + ' ' + r.User.lastName, bloodType: r.bloodType, when: r.createdAt, donorId: byUser.get(r.userId) || null }));
      pledgeState = 'own';
    } else if (request.status !== 'active' || request.hospitalStatus !== 'approved') pledgeState = 'inactive';
    else {
      const donor = await Donor.findOne({ where: { userId: account.id } });
      if (!donor) pledgeState = 'nodonor';
      else if (!isDonorReady(donor)) pledgeState = 'unavailable';
      else if (!isCompatible(donor.bloodType, request.bloodType)) pledgeState = 'incompatible';
      else pledgeState = await Pledge.findOne({ where: { requestId: request.id, userId: account.id } }) ? 'pledged' : 'offer';
    }
    const appointment = await Appointment.findOne({ where: { requestId: request.id, status: 'scheduled' }, order: [['id', 'DESC']] });
    const rawHistory = await WorkflowEvent.findAll({ where: { requestId: request.id }, order: [['createdAt', 'DESC']], limit: 100 });
    const history = rawHistory.map(row => ({ label: row.action.replaceAll('_', ' '), description: privateView && row.reason ? row.reason : (row.details?.unitsProvided ? row.details.unitsProvided + ' unit(s) recorded' : ''), createdAt: row.createdAt }));
    const data = { ...request.toJSON(), unitsRemaining: unitsRemaining(request), appointmentId: appointment?.id, appointmentVersion: appointment?.version };
    if (!isOwner && !isAdmin && !facilityView) {
      // Donor invitations disclose coordination details, not patient clinical records.
      for (const field of ['patientName', 'patientAge', 'indicationOfTransfusion', 'notes', 'fulfillmentNotes', 'email', 'contactPerson', 'contactNumber']) data[field] = null;
    }
    // Compatible-donor matches for private viewers (owner/admin/matched facility).
    // Privacy-safe: blood type, city and distance only - no donor identities.
    let matchingDonors = [];
    if (privateView && request.status === 'active' && request.hospitalStatus === 'approved') {
      try {
        const matches = await findNearestDonors(request, 10);
        matchingDonors = matches.map(({ donor, distanceKm }) => ({
          bloodType: donor.bloodType,
          city: donor.city || null,
          distanceText: distanceKm === null ? 'Distance not confirmed' : `${distanceKm.toFixed(1)} km away`
        }));
      } catch (e) { console.error('Matching donors failed:', e.message); }
    }
    // Unified lifecycle display: Pending, Under Review, Approved,
    // Donor Matching in Progress, Donor Confirmed, Fulfilled, Rejected, Cancelled.
    let displayStatus = 'Pending';
    let displayStep = 0;
    if (request.status === 'cancelled') { displayStatus = 'Cancelled'; displayStep = -1; }
    else if (request.status === 'fulfilled') { displayStatus = 'Fulfilled'; displayStep = 5; }
    else if (request.status === 'scheduled') { displayStatus = 'Donor Confirmed'; displayStep = 4; }
    else if (request.status === 'pending' && request.hospitalStatus === 'declined') { displayStatus = 'Rejected'; displayStep = -1; }
    else if (request.status === 'pending') { displayStatus = 'Under Review'; displayStep = 1; }
    else if (request.hospitalStatus === 'approved' && pledgeCount > 0) { displayStatus = 'Donor Matching in Progress'; displayStep = 3; }
    else if (request.hospitalStatus === 'approved') { displayStatus = 'Approved'; displayStep = 2; }
    const latestDecline = rawHistory.find(e => e.action === 'facility_declined');
    const nextAction = request.status === 'pending' ? request.hospitalStatus === 'declined' ? 'Correct the returned request and submit it for a fresh review, or cancel it if blood is no longer needed.' : 'The assigned facility or coordinator must review this request before donor outreach starts.' : request.status === 'scheduled' ? 'Both parties must confirm the current appointment. A coordinator records completion after it occurs.' : request.status === 'active' ? 'Donors may offer to donate. A coordinator reviews offers and arranges an appointment.' : 'The coordination workflow is closed. Its history is retained.';
    res.render('view-blood-request', { title: 'Blood Request Details - VitalMatch', request: data, isAdmin, isOwner, canReviewHospital, pledgeState, pledgeCount, pledges, matchingDonors, displayStatus, displayStep, history, nextAction, hospitalDeclineReason: privateView ? latestDecline?.reason : null, emergencyActive: isEmergencyActive(request), canManageEmergency: (isAdmin || isOwner) && request.status === 'active' && request.hospitalStatus === 'approved', unverifiedFacility: !request.facilityId });
  } catch (error) {
    console.error('Request detail failed:', error.name);
    res.status(503).render('error', { title: 'Request unavailable', message: 'The request could not be loaded. Please retry.' });
  }
};

export const pledgeToDonate = async (req, res) => {
  try { const request = await pledgeRequest(req.params.id, req.session.userId); req.flash('success_msg', 'Your offer is recorded. A coordinator will arrange the next step.'); res.redirect('/view-blood-request/' + request.id); }
  catch (error) { req.flash('error_msg', error.status ? error.message : 'Could not save your pledge. Please retry.'); res.redirect('/dashboard'); }
};
export const withdrawPledge = async (req, res) => {
  try { await pledgeRequest(req.params.id, req.session.userId, true); req.flash('success_msg', 'Your pledge was withdrawn and the coordinator was notified.'); res.redirect('/view-blood-request/' + req.params.id); }
  catch (error) { req.flash('error_msg', error.status ? error.message : 'Could not withdraw your pledge.'); res.redirect('/dashboard'); }
};
export const isEmergencyActive = request => !!(request && request.isEmergency && request.emergencyExpiresAt && new Date(request.emergencyExpiresAt) > new Date() && request.status === 'active' && request.hospitalStatus === 'approved');
async function setEmergency(req, res, enabled) {
  try {
    const request = await retryTransaction(async transaction => {
      const request = await BloodRequest.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!request || request.archivedAt || (req.session.userRole !== 'admin' && request.userId !== req.session.userId)) throw new WorkflowError('You cannot change this request', 403);
      if (enabled && (request.status !== 'active' || request.hospitalStatus !== 'approved')) throw new WorkflowError('Only reviewed active requests can be escalated');
      if (enabled && isEmergencyActive(request)) throw new WorkflowError('An escalation is already active');
      if (!enabled && !request.isEmergency) throw new WorkflowError('There is no escalation to clear');
      await request.update({ isEmergency: enabled, emergencyAt: enabled ? new Date() : null, emergencyExpiresAt: enabled ? new Date(Date.now() + 6 * 3600000) : null, version: request.version + 1 }, { transaction });
      if (enabled) await notifyEmergency(request, transaction);
      await WorkflowEvent.create({ requestId: request.id, actorId: req.session.userId, action: enabled ? 'emergency_escalated' : 'emergency_cleared', details: { expiresAt: request.emergencyExpiresAt } }, { transaction });
      if (enabled) await queueCoordination(request, { transaction, mode: 'emergency' });
      return request;
    });
    req.flash('success_msg', enabled ? 'Escalation saved. Up to 1,000 coordination invitations are queued.' : 'Escalation cleared.');
    if (enabled) dispatchCriticalEmailsNow();
    res.redirect('/view-blood-request/' + request.id);
  } catch (error) { req.flash('error_msg', error.status ? error.message : 'Could not save the escalation.'); res.redirect('/dashboard'); }
}
export const escalateRequest = (req, res) => setEmergency(req, res, true);
export const clearEmergency = (req, res) => setEmergency(req, res, false);

export const submitBloodRequest = async (req, res) => {
  try {
    const data = normalizeRequestInput(req.body);
    const result = await createRequest(data, req.session.userId, req.body.submissionKey || req.session.requestSubmissionKey);
    // Critical requests need action now: push queued emails out immediately
    // instead of waiting for the worker's next tick.
    if (!result.duplicate && (result.request.urgency || '').toLowerCase() === 'critical') dispatchCriticalEmailsNow();
    delete req.session.requestSubmissionKey;
    delete req.session.requestFormValues;
    req.flash('success_msg', result.request.status === 'pending' ? 'Request saved for facility or coordinator review. Donor outreach begins after approval.' : 'Request saved. Donor invitations are queued.');
    res.redirect('/view-blood-request/' + result.request.id);
  } catch (error) {
    req.session.requestFormValues = req.body;
    req.flash('error_msg', error instanceof WorkflowError ? error.message : 'Could not save the request. Please retry the same form.');
    res.redirect('/new-blood-request');
  }
};
export const correctBloodRequest = async (req, res) => {
  try {
    const request = await correctRequest(req.params.id, req.session.userId, normalizeRequestInput(req.body), req.body.version);
    delete req.session.requestFormValues;
    req.flash('success_msg', 'Correction saved. A fresh facility or coordinator review is required.');
    res.redirect('/view-blood-request/' + request.id);
  } catch (error) {
    req.session.requestFormValues = req.body;
    req.flash('error_msg', error.status ? error.message : 'Could not save the correction. Please retry.');
    res.redirect('/requests/' + req.params.id + '/edit');
  }
};
