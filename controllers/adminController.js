import { searchTerm, withTextSearch, recordPage } from '../services/recordSearch.js';
/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { BloodRequest } from "../models/bloodRequestModel.js";
import { Donor } from "../models/donorModel.js";
import { sequelize } from "../models/db.js";
import { vitalMatchBlockchain } from "../services/blockchainService.js";
import { Op } from "sequelize";
import { findNearestDonors } from "../services/matchingService.js";
import crypto from "node:crypto";
import { Appointment } from "../models/appointmentModel.js";
import { WorkflowEvent, Fulfillment } from "../models/workflowEventModel.js";
import { Facility } from "../models/facilityModel.js";
import { listFacilities } from "../services/facilityService.js";
import { isCompatible } from "../models/pledgeModel.js";
import { donationIntervalDays, donorAge, donorAgeBounds, isDonorReady, unitsRemaining } from "../services/coordinationPolicy.js";
import { createRequest, scheduleRequest, fulfillRequest as recordFulfillment, changeAppointment, reviewRequest, WorkflowError } from "../services/requestLifecycleService.js";
import { retryTransaction } from '../services/transactionService.js';

function readyDonorWhere() {
  const ages = donorAgeBounds();
  return {
    isAvailable: true,
    dateOfBirth: { [Op.gt]: ages.after, [Op.lte]: ages.through },
    [Op.and]: [
      { [Op.or]: [{ lastDonationDate: null }, { lastDonationDate: { [Op.lte]: new Date(Date.now() - donationIntervalDays() * 86400000) } }] },
      sequelize.literal("NOT EXISTS (SELECT 1 FROM Appointments occupied WHERE occupied.donorId = Donor.id AND occupied.status = 'scheduled')")
    ]
  };
}
const readyAccount = { isActive: true, emailVerified: true, archivedAt: null };
function countReadyDonors() {
  return Donor.count({ where: readyDonorWhere(), include: [{ model: User, required: true, attributes: [], where: readyAccount }] });
}
function userMutationFailure(error, fallback) {
  if (error.name === 'SequelizeUniqueConstraintError') return { status: 409, message: 'That account email is already registered.' };
  const expected = /^(?:User not found|All required fields must be provided|Invalid (?:role|isActive|emailVerified|firstName|lastName|email|phone|address|dateOfBirth|gender|hospitalName|facility|profile)|At least one (?:active |active verified |verified active )?administrator must remain|Archived accounts require a reviewed restoration procedure|Select an active verified facility|An official hospital name is required|This facility is inactive|You cannot archive your own account|Active account not found)$/;
  if (error.name === 'Error' && expected.test(error.message)) return { status: error.message === 'User not found' ? 404 : 400, message: error.message };
  if (error.name === 'SequelizeValidationError') return { status: 400, message: 'Review the required account fields and try again.' };
  return { status: 503, message: fallback };
}

// Display the admin dashboard
export const adminDashboardPage = async (req, res) => {
  try {
    // Get total counts
    const totalRequests = await BloodRequest.count();
    const activeDonors = await countReadyDonors();
    const successfulMatches = await BloodRequest.count({ where: { status: 'fulfilled' } });
    const unitsCollected = Number(await Fulfillment.sum('unitsProvided') || 0);

    // Get monthly request data for the chart (last 12 months)
    const monthlyRequests = await BloodRequest.findAll({
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m'), 'month'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: {
        createdAt: {
          [Op.gte]: new Date(new Date().setMonth(new Date().getMonth() - 11))
        }
      },
      group: [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m')],
      order: [[sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m'), 'ASC']],
      raw: true
    });

    // Get blood type distribution
    const bloodTypeDistribution = await BloodRequest.findAll({
      attributes: [
        'bloodType',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['bloodType'],
      raw: true
    });

    // Get monthly donor registrations (last 12 months)
    const monthlyDonors = await Donor.findAll({
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m'), 'month'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: {
        createdAt: {
          [Op.gte]: new Date(new Date().setMonth(new Date().getMonth() - 11))
        }
      },
      group: [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m')],
      order: [[sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m'), 'ASC']],
      raw: true
    });

    // Get status breakdown
    const statusBreakdown = await BloodRequest.findAll({
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    // Get recent requests
    const recentRequests = await BloodRequest.findAll({
      limit: 4,
      order: [['createdAt', 'DESC']]
    });

    // Get top hospitals
    const topHospitals = await BloodRequest.findAll({
      attributes: [
        'hospitalName',
        'city',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['hospitalName', 'city'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
      limit: 5,
      raw: true
    });

    // Get regional distribution
    const regionalDistribution = await BloodRequest.findAll({
      attributes: [
        'province',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['province'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
      raw: true
    });

    res.render("admin-dashboard", {
      layout: "admin",
      title: "Admin Dashboard - VitalMatch",
      isDashboard: true,
      stats: {
        totalRequests,
        activeDonors,
        successfulMatches,
        unitsCollected,
      },
      monthlyRequests: JSON.stringify(monthlyRequests).replace(/</g, '\\u003c'),
      bloodTypeDistribution: JSON.stringify(bloodTypeDistribution).replace(/</g, '\\u003c'),
      monthlyDonors: JSON.stringify(monthlyDonors).replace(/</g, '\\u003c'),
      statusBreakdown: JSON.stringify(statusBreakdown).replace(/</g, '\\u003c'),
      recentRequests,
      topHospitals,
      regionalDistribution
    });
  } catch (error) {
    console.error("Admin dashboard failed:", error.name);
    res.status(503).render("admin-dashboard", {
      layout: "admin",
      title: "Admin Dashboard - VitalMatch",
      isDashboard: true,
      error: 'Dashboard records could not be loaded. Please retry.',
      stats: { totalRequests: 0, activeDonors: 0, successfulMatches: 0, unitsCollected: 0 },
      monthlyRequests: JSON.stringify([]),
      bloodTypeDistribution: JSON.stringify([]),
      monthlyDonors: JSON.stringify([]),
      statusBreakdown: JSON.stringify([]),
      recentRequests: [],
      topHospitals: [],
      regionalDistribution: []
    });
  }
};

// Display admin requests page
export const adminRequestsPage = async (req, res) => {
  try {
    const filter = req.query.filter || '';
    const where = { archivedAt: null };
    if (['active', 'scheduled', 'fulfilled', 'cancelled', 'pending'].includes(filter)) where.status = filter;
    if (/^\d+$/.test(String(req.query.schedule || ''))) where.id = Number(req.query.schedule);
    const search = searchTerm(req.query);
    const searchedWhere = withTextSearch(where, search, ['patientName','hospitalName','city','bloodType','contactPerson','contactNumber']);
    const { rows, pagination } = await recordPage(BloodRequest, { where: searchedWhere, order: [['createdAt', 'DESC']] }, req.query, req.path);
    const ids = rows.map(r => r.id);
    const { Pledge } = await import('../models/pledgeModel.js');
    const pledges = ids.length ? await Pledge.findAll({ where: { requestId: ids }, attributes: ['requestId', 'userId'], raw: true }) : [];
    const pledgedUsers = [...new Set(pledges.map(p => p.userId))];
    const pledgedProfiles = pledgedUsers.length ? await Donor.findAll({ where: { userId: pledgedUsers }, attributes: ['id','userId','fullName','bloodType','mobileNumber','email','city','province','isAvailable','lastDonationDate','dateOfBirth'], include: [{ model: User, attributes: ['id','isActive','emailVerified'] }] }) : [];
    const candidateCache = new Map(), candidateRows = new Map();
    await Promise.all(rows.filter(r => r.status === 'active' && r.hospitalStatus === 'approved').map(async request => {
      const cacheKey = JSON.stringify([request.bloodType,request.latitude,request.longitude,request.city,request.province,request.userId]);
      if (!candidateCache.has(cacheKey)) candidateCache.set(cacheKey,findNearestDonors(request,10));
      candidateRows.set(request.id,(await candidateCache.get(cacheKey)).map(match => match.donor));
    }));
    const displayedDonorIds = [...new Set([...pledgedProfiles.map(d => d.id), ...[...candidateRows.values()].flat().map(d => d.id)])];
    const openAppointments = ids.length ? await Appointment.findAll({ where: { status: 'scheduled', [Op.or]: [{ requestId: ids }, ...(displayedDonorIds.length ? [{ donorId: displayedDonorIds }] : [])] }, attributes: ['id', 'requestId', 'donorId', 'version'], raw: true }) : [];
    const occupied = new Set(openAppointments.map(a => a.donorId));
    const requests = rows.map(request => {
      const offered = new Set(pledges.filter(p => p.requestId === request.id).map(p => p.userId));
      const candidates = candidateRows.get(request.id) || [];
      const selected = new Map(candidates.map(d => [d.id,d]));
      pledgedProfiles.filter(d => offered.has(d.userId)).forEach(d => selected.set(d.id,d));
      const appointment = openAppointments.find(a => a.requestId === request.id);
      return { ...request.toJSON(), unitsRemaining: unitsRemaining(request), reviewRequired: request.hospitalStatus !== 'approved', unverifiedFacility: !request.facilityId, pledgeCount: offered.size, emergencyActive: !!(request.isEmergency && request.emergencyExpiresAt > new Date() && request.status === 'active'), appointmentId: appointment?.id || null, appointmentVersion: appointment?.version || null, matchingDonorsCount: candidates.length, matchingDonors: [...selected.values()].map(d => ({ id: d.id, userId: d.userId, fullName: d.fullName, bloodType: d.bloodType, mobileNumber: d.mobileNumber, email: d.email, city: d.city, province: d.province, pledged: offered.has(d.userId), isAssignable: isDonorReady(d) && isCompatible(d.bloodType, request.bloodType) && !occupied.has(d.id) && (d.User?.isActive ?? true) && (d.User?.emailVerified ?? true) })) };
    });
    res.render('admin-requests', { layout: 'admin', title: 'Manage Requests - VitalMatch Admin', isRequests: true, requests, filter, search, pagination, error: null });
  } catch (error) {
    console.error('Request list failed:', error.name);
    const connectionCode = error.parent?.code || error.original?.code || error.code;
    const transientConnectionFailure = /ConnectionAcquireTimeoutError|ConnectionError|ConnectionRefusedError|ConnectionTimedOutError/.test(error.name || '') || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR'].includes(connectionCode);
    if (transientConnectionFailure && !req._adminRequestsRetried) {
      req._adminRequestsRetried = true;
      await new Promise(resolve => setTimeout(resolve, 150));
      return adminRequestsPage(req, res);
    }
    res.status(503).render('admin-requests', { layout: 'admin', title: 'Requests unavailable', isRequests: true, requests: [], filter: null, error: 'Requests could not be loaded. Please retry.' });
  }
};

// Display admin donors page
export const adminDonorsPage = async (req, res) => {
  try {
    const filter = String(req.query.filter || ''), bloodType = String(req.query.bloodType || '');
    const where = {};
    if (filter === 'available') Object.assign(where, readyDonorWhere());
    const ages = donorAgeBounds();
    if (filter === 'unavailable') where[Op.and] = [{ [Op.or]: [
      { isAvailable: false },
      { dateOfBirth: null }, { dateOfBirth: { [Op.lte]: ages.after } }, { dateOfBirth: { [Op.gt]: ages.through } },
      { lastDonationDate: { [Op.gt]: new Date(Date.now() - donationIntervalDays() * 86400000) } },
      { '$User.isActive$': false }, { '$User.emailVerified$': false }, { '$User.archivedAt$': { [Op.ne]: null } },
      sequelize.literal("EXISTS (SELECT 1 FROM Appointments occupied WHERE occupied.donorId = Donor.id AND occupied.status = 'scheduled' AND occupied.scheduledDate >= NOW())")
    ] }];
    if (['O-','O+','A-','A+','B-','B+','AB-','AB+'].includes(bloodType)) where.bloodType = bloodType;
    const search = searchTerm(req.query);
    const searchedWhere = withTextSearch(where, search, ['fullName','city','province','bloodType','mobileNumber','email']);
    const { rows, pagination } = await recordPage(Donor, { where: searchedWhere, include: [{ model: User, required: true, attributes: ['isActive','emailVerified','archivedAt'], ...(filter === 'available' ? { where: readyAccount } : {}) }], order: [['createdAt','DESC']] }, req.query, req.path);
    const donorIds = rows.map(d => d.id);
    const scheduled = donorIds.length ? await Appointment.findAll({ where: { donorId: donorIds, status: 'scheduled', scheduledDate: { [Op.gte]: new Date() } }, attributes: ['donorId'], raw: true }) : [];
    const occupied = new Set(scheduled.map(a => a.donorId));
    const donors = rows.map(d => ({ ...d.toJSON(), coordinationReady: isDonorReady(d) && d.User?.isActive && d.User?.emailVerified && !d.User?.archivedAt && !occupied.has(d.id), age: donorAge(d.dateOfBirth), accountActive: d.User?.isActive }));
    res.render('admin-donors', { layout: 'admin', title: 'Manage Donors - VitalMatch Admin', isDonors: true, donors, filter, bloodType, search, error: null, pagination });
  } catch (error) { res.status(503).render('admin-donors',{ layout:'admin',title:'Donors unavailable',isDonors:true,donors:[],filter:null,error:'Donors could not be loaded. Please retry.' }); }
};
export const adminHospitalsPage = async (req, res) => {
  try {
    const search = searchTerm(req.query);
    const { rows: facilities, pagination } = await recordPage(Facility, { where: withTextSearch({},search,['hospitalName']), order:[['hospitalName','ASC']] },req.query,req.path);
    const ids = facilities.map(f=>f.id);
    const stats = ids.length ? await BloodRequest.findAll({ where:{facilityId:ids,hospitalStatus:'approved'},attributes:['facilityId',[sequelize.fn('COUNT',sequelize.col('id')),'totalCount'],[sequelize.fn('SUM',sequelize.literal("CASE WHEN status = 'active' THEN 1 ELSE 0 END")),'activeCount'],[sequelize.fn('SUM',sequelize.literal("CASE WHEN status = 'fulfilled' THEN 1 ELSE 0 END")),'fulfilledCount']],group:['facilityId'],raw:true }) : [];
    const hospitals = facilities.map(f=>({ ...f.toJSON(), ...stats.find(s=>s.facilityId===f.id), hospitalName:f.hospitalName,totalCount:Number(stats.find(s=>s.facilityId===f.id)?.totalCount||0) }));
    const accountSearch = searchTerm({search:req.query.accountSearch});
    const { rows: hospitalUsers, pagination: accountPagination } = await recordPage(User, { where:withTextSearch({role:{[Op.in]:['hospital','hospital_admin']},archivedAt:null},accountSearch,['firstName','lastName','hospitalName','email','phone','address']),attributes:['id','firstName','lastName','hospitalName','facilityId','email','phone','address','isActive','emailVerified','createdAt'],order:[['createdAt','DESC']] },req.query,req.path,'accountPage');
    res.render('admin-hospitals',{layout:'admin',title:'Facilities - VitalMatch Admin',isHospitals:true,hospitals,hospitalUsers,search,accountSearch,accountPagination,error:null,pagination});
  } catch(error) { res.status(503).render('admin-hospitals',{layout:'admin',title:'Facilities unavailable',isHospitals:true,hospitals:[],hospitalUsers:[],error:'Facilities could not be loaded. Please retry.'}); }
};
export const setHospitalStatus = async (req, res) => {
  try {
    if (!['verify','suspend'].includes(req.params.action)) throw new WorkflowError('Choose verify or suspend');
    const hospital = await User.findOne({ where:{id:req.params.id,role:{[Op.in]:['hospital','hospital_admin']}} });
    if (!hospital) throw new WorkflowError('Hospital account not found',404);
    const activate = req.params.action === 'verify';
    if (activate && !hospital.facilityId) throw new WorkflowError('Assign this account to a verified facility in account management before activating it');
    await UserService.updateUser(hospital.id,{isActive:activate},req.session.userId,AuditService.getRequestContext(req));
    res.json({success:true,isActive:activate,message:activate?'Hospital account activated.':'Hospital account suspended; its sessions are revoked.'});
  } catch(error) { res.status(error.status || 400).json({success:false,message:error.status ? error.message : 'Could not update hospital account. Review its facility assignment.'}); }
};

// Shared report dataset for the page and the CSV export
async function getReportsData() {
  try {
    // Summary statistics
    const totalRequests = await BloodRequest.count();
    const activeRequests = await BloodRequest.count({ where: { status: 'active' } });
    const fulfilledRequests = await BloodRequest.count({ where: { status: 'fulfilled' } });
    const cancelledRequests = await BloodRequest.count({ where: { status: 'cancelled' } });

    const totalDonors = await Donor.count();
    const availableDonors = await countReadyDonors();
    const unavailableDonors = totalDonors - availableDonors;

    const successRate = totalRequests > 0 ? Math.round((fulfilledRequests / totalRequests) * 100) : 0;

    // Blood type report
    const bloodTypeReport = await BloodRequest.findAll({
      attributes: [
        'bloodType',
        [sequelize.fn('COUNT', sequelize.col('id')), 'requestCount'],
        [sequelize.fn('SUM', sequelize.col('unitsRequired')), 'totalUnits'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'fulfilled' THEN 1 ELSE 0 END")), 'fulfilledCount']
      ],
      group: ['bloodType'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
      raw: true
    });

    // Add percentage to blood type report
    bloodTypeReport.forEach(item => {
      item.percentage = totalRequests > 0 ? Math.round((item.requestCount / totalRequests) * 100) : 0;
    });

    // Monthly trend report (last 6 months)
    const monthlyRequests = await BloodRequest.findAll({
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m'), 'month'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'requests'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'fulfilled' THEN 1 ELSE 0 END")), 'fulfilled']
      ],
      where: {
        createdAt: {
          [Op.gte]: new Date(new Date().setMonth(new Date().getMonth() - 5))
        }
      },
      group: [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m')],
      order: [[sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m'), 'ASC']],
      raw: true
    });

    const monthlyDonors = await Donor.findAll({
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m'), 'month'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'donors']
      ],
      where: {
        createdAt: {
          [Op.gte]: new Date(new Date().setMonth(new Date().getMonth() - 5))
        }
      },
      group: [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m')],
      order: [[sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m'), 'ASC']],
      raw: true
    });

    const unitsCollected = Number(await Fulfillment.sum('unitsProvided') || 0);
    const completedDonations = await Fulfillment.count({ where: { donorId: { [Op.ne]: null } } });
    const unknownHistoricalCompletions = await BloodRequest.count({ where: { status: 'fulfilled', fulfilledAt: null } });
    // Verified completion timing uses a dedicated immutable completion date.
    const averageRows = await BloodRequest.findAll({ where: { status: 'fulfilled', fulfilledAt: { [Op.ne]: null } }, attributes: [[sequelize.fn('AVG', sequelize.literal('TIMESTAMPDIFF(SECOND, createdAt, fulfilledAt)')), 'seconds']], raw: true });
    const seconds = Number(averageRows[0]?.seconds);
    const avgResponseTime = Number.isFinite(seconds) && averageRows[0]?.seconds !== null ? Math.max(0, Math.round(seconds / 3600)) + 'h' : 'N/A';

    // Merge monthly data
    const monthlyReport = monthlyRequests.map(req => {
      const donor = monthlyDonors.find(d => d.month === req.month);
      const successRate = req.requests > 0 ? Math.round((req.fulfilled / req.requests) * 100) : 0;
      return {
        month: new Date(req.month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        requests: req.requests,
        donors: donor ? donor.donors : 0,
        fulfilled: req.fulfilled,
        successRate
      };
    });

    return {
      summary: {
        totalRequests,
        activeRequests,
        fulfilledRequests,
        cancelledRequests,
        totalDonors,
        availableDonors,
        unavailableDonors,
        unitsCollected,
        completedDonations,
        unknownHistoricalCompletions,
        successRate,
        avgResponseTime
      },
      bloodTypeReport,
      monthlyReport
    };
  } catch (error) {
    console.error("Report data failed:", error.name);
    throw error;
  }
}

// Display admin reports page
export const adminReportsPage = async (req, res) => {
  try {
    const { summary, bloodTypeReport, monthlyReport } = await getReportsData();
    res.render("admin-reports", {
      layout: "admin",
      title: "Reports - VitalMatch Admin",
      isReports: true,
      summary,
      bloodTypeReport,
      monthlyReport
    });
  } catch (error) {
    console.error("Reports failed:", error.name);
    res.status(503).render("admin-reports", {
      layout: "admin",
      title: "Reports - VitalMatch Admin",
      isReports: true,
      error: 'Report records could not be loaded. Please retry.',
      summary: {
        totalRequests: 0,
        activeRequests: 0,
        fulfilledRequests: 0,
        cancelledRequests: 0,
        totalDonors: 0,
        availableDonors: 0,
        unavailableDonors: 0,
        unitsCollected: 0,
        successRate: 0,
        avgResponseTime: 'N/A'
      },
      bloodTypeReport: [],
      monthlyReport: []
    });
  }
};

// Export reports to CSV
export const exportReports = async (req, res) => {
  try {
    const { summary, bloodTypeReport, monthlyReport } = await getReportsData();
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [];
    lines.push("VitalMatch System Report," + new Date().toISOString().slice(0, 10));
    lines.push("");
    lines.push("Summary");
    lines.push("Metric,Value");
    Object.entries(summary).forEach(([k, v]) => lines.push(`${k},${v}`));
    lines.push("");
    lines.push("Blood Type Report");
    lines.push("Blood Type,Requests,Units,Fulfilled,Share %");
    bloodTypeReport.forEach(r => lines.push([r.bloodType, r.requestCount, r.totalUnits, r.fulfilledCount, r.percentage].map(esc).join(",")));
    lines.push("");
    lines.push("Monthly Trend");
    lines.push("Month,Requests,Donors,Fulfilled,Success Rate %");
    monthlyReport.forEach(r => lines.push([r.month, r.requests, r.donors, r.fulfilled, r.successRate].map(esc).join(",")));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="vitalmatch-report.csv"');
    res.send(lines.join("\n"));
  } catch (error) {
    console.error("Report export failed:", error.name);
    res.status(500).json({ success: false, message: "Error exporting reports" });
  }
};

// Display admin blockchain dashboard
export const adminBlockchainPage = (req, res) => {
  res.render("admin-blockchain", {
    layout: "admin",
    title: "Blockchain Dashboard - VitalMatch Admin",
    isBlockchain: true
  });
};

// Display admin new blood request form
export const adminNewBloodRequestPage = async (req, res) => {
  const submissionKey = req.session.requestSubmissionKey ||= crypto.randomUUID();
  const formValues = req.session.requestFormValues || { submissionKey };
  delete req.session.requestFormValues;
  res.render('admin-new-request', { layout: 'admin', title: 'New Blood Request - VitalMatch', facilities: await listFacilities(), formValues, formValuesJson: JSON.stringify(formValues).replace(/</g, '\\u003c') });
};

export const createBloodRequest = async (req, res) => {
  try {
    const { normalizeRequestInput } = await import('../services/requestInputService.js');
    const data = normalizeRequestInput(req.body);
    const result = await createRequest(data, req.session.userId, req.body.submissionKey || req.session.requestSubmissionKey);
    delete req.session.requestSubmissionKey;
    delete req.session.requestFormValues;
    req.flash('success_msg', 'Blood request saved. Donor outreach is queued after review.');
    res.redirect('/view-blood-request/' + result.request.id);
  } catch (error) {
    req.session.requestFormValues = req.body;
    req.flash('error_msg', error instanceof WorkflowError ? error.message : 'The request could not be saved. Please retry the same form.');
    res.redirect('/admin/new-blood-request');
  }
};

// Fulfill or Schedule a blood request
export const fulfillRequest = async (req, res) => {
  try {
    const result = req.body.scheduledDate
      ? await scheduleRequest(req.params.id, req.session.userId, req.body)
      : await recordFulfillment(req.params.id, req.session.userId, req.body);
    res.json({ success: true, message: result.duplicate ? 'This action was already recorded.' : result.appointment ? 'Appointment saved. Confirmation notices are queued.' : result.complete ? 'Request fulfilled. Completion is recorded.' : 'Partial fulfillment saved. Remaining units are open for coordination.', requestId: result.request.id, unitsRemaining: unitsRemaining(result.request), appointmentId: result.appointment?.id });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error instanceof WorkflowError ? error.message : 'This action could not be saved. Retry with the same operation key.' });
  }
};
export const rescheduleAppointment = async (req, res) => {
  try {
    await changeAppointment(req.params.id, req.session.userId, req.body, 'reschedule');
    res.json({ success: true, message: 'Appointment rescheduled. Both parties must confirm the new date.' });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Could not reschedule appointment' }); }
};
export const cancelAppointment = async (req, res) => {
  try {
    const result = await changeAppointment(req.params.id, req.session.userId, req.body, 'cancel');
    res.json({ success: true, message: 'Appointment cancelled. The request is open for coordination.' });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Could not cancel appointment' }); }
};
export const reviewBloodRequest = async (req, res) => {
  try {
    if (!['approve', 'decline'].includes(req.body.action)) throw new WorkflowError('Choose approve or decline');
    const request = await reviewRequest(req.params.id, req.session.userId, req.body.action === 'approve', req.body.reason);
    res.json({ success: true, message: 'Review decision saved.' });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Could not review request' }); }
};
export const criticalAlerts = async (req, res) => {
  try {
    const criticals = await BloodRequest.findAll({
      where: {
        urgency: 'critical',
        status: { [Op.in]: ['active', 'pending'] },
        archivedAt: null
      },
      attributes: ['id', 'bloodType', 'unitsRequired', 'hospitalName', 'city', 'status', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 10
    });
    res.json({ success: true, count: criticals.length, criticals });
  } catch (error) { res.status(500).json({ success: false, message: 'Could not load critical alerts' }); }
};
export const deleteRequest = async (req, res) => {
  try {
    await retryTransaction(async transaction => {
      const request = await BloodRequest.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!request) throw new WorkflowError('Request not found', 404);
      if (request.archivedAt) return;
      if (!['fulfilled', 'cancelled'].includes(request.status)) throw new WorkflowError('Cancel an open request before archiving it');
      await request.update({ archivedAt: new Date() }, { transaction });
      await WorkflowEvent.create({ requestId: request.id, actorId: req.session.userId, action: 'request_archived', details: { previousStatus: request.status } }, { transaction });
    });
    res.json({ success: true, message: 'Request archived. Its history remains available.' });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Could not archive request' }); }
};



// User Management Methods

import { User } from "../models/userModel.js";
import { UserService } from "../services/userService.js";
import { AuditService } from "../services/auditService.js";

// Display user management page
export const getUserManagementPage = async (req, res) => {
  try {
    res.render("admin-users", {
      layout: "admin",
      title: "User Management - VitalMatch Admin",
      isUsers: true
    });
  } catch (error) {
    console.error("User management page failed:", error.name);
    res.status(503).render("admin-users", {
      layout: "admin",
      title: "User Management - VitalMatch Admin",
      isUsers: true,
      error: 'Account management could not be loaded. Please retry.'
    });
  }
};

// Get paginated user list (API endpoint)
export const getUserList = async (req, res) => {
  try {
    const filters = {
      search: req.query.search || '',
      role: req.query.role || '',
      status: req.query.status || '',
      dateRange: {
        start: req.query.startDate,
        end: req.query.endDate
      }
    };

    const pagination = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      sort: req.query.sort || 'createdAt DESC'
    };

    const result = await UserService.getUserList(filters, pagination);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error("User list failed:", error.name);
    res.status(503).json({ success: false, message: 'Accounts could not be loaded. Please retry.' });
  }
};

// Get single user details
export const getUserDetails = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await UserService.getUserById(userId);

    res.json({ success: true, user });
  } catch (error) {
    console.error("User details failed:", error.name);
    res.status(error.message === 'User not found' ? 404 : 503).json({ success: false, message: error.message === 'User not found' ? 'Account not found' : 'Account details could not be loaded. Please retry.' });
  }
};

// Create new user
export const createUser = async (req, res) => {
  try {
    const adminId = req.session.userId; // Session stores userId (see authController loginUser)
    const context = AuditService.getRequestContext(req);
    const result = await UserService.createUser(req.body, adminId, context);

    res.json({
      success: true,
      message: 'User created successfully',
      user: result.user,
      tempPassword: result.tempPassword
    });
  } catch (error) {
    console.error("User creation failed:", error.name);
    const failure = userMutationFailure(error,'Could not create the account. Please retry.');
    res.status(failure.status).json({ success: false, message: failure.message });
  }
};

// Update user
export const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const adminId = req.session.userId; // Session stores userId (see authController loginUser)
    const context = AuditService.getRequestContext(req);

    const result = await UserService.updateUser(userId, req.body, adminId, context);

    res.json({
      success: true,
      message: 'User updated successfully',
      user: result.user,
      changes: result.changes
    });
  } catch (error) {
    console.error("User update failed:", error.name);
    const failure = userMutationFailure(error,'Could not update the account. Please retry.');
    res.status(failure.status).json({ success: false, message: failure.message });
  }
};

// Delete user (soft delete)
export const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const adminId = req.session.userId; // Session stores userId (see authController loginUser)
    const context = AuditService.getRequestContext(req);

    await UserService.deleteUser(userId, adminId, context);

    res.json({ success: true, message: 'Account archived. Request, donation and communication history is preserved.' });
  } catch (error) {
    console.error("Account archival failed:", error.name);
    const failure = userMutationFailure(error,'Could not archive the account. Please retry.');
    res.status(failure.status).json({ success: false, message: failure.message });
  }
};

// Bulk update users (only role and active status may be changed in bulk)
export const bulkUpdateUsers = async (req, res) => {
  const { userIds, updates } = req.body;
  if (!Array.isArray(userIds) || !userIds.length || userIds.length > 100 || userIds.some(id => !Number.isInteger(Number(id)) || Number(id) < 1)) return res.status(400).json({ success: false, message: 'Select between one and 100 valid users' });
  const targets = [...new Set(userIds.map(Number))];
  if (targets.includes(req.session.userId)) return res.status(400).json({ success: false, message: 'Your own role or status cannot be changed in bulk' });
  const values = {};
  if (updates?.role !== undefined) {
    if (!['user','donor','admin'].includes(updates.role)) return res.status(400).json({ success: false, message: 'Assign hospital accounts individually with a verified facility' });
    values.role = updates.role;
  }
  if (typeof updates?.isActive === 'boolean') values.isActive = updates.isActive;
  if (!Object.keys(values).length) return res.status(400).json({ success: false, message: 'Choose a valid role or active-status change' });
  const updatedIds = [], failedIds = [];
  for (const id of targets) {
    try { await UserService.updateUser(id, values, req.session.userId, AuditService.getRequestContext(req)); updatedIds.push(id); }
    catch { failedIds.push(id); }
  }
  res.status(failedIds.length ? 409 : 200).json({ success: !failedIds.length, partial: !!updatedIds.length && !!failedIds.length, message: failedIds.length ? updatedIds.length + ' account(s) updated; ' + failedIds.length + ' could not be changed. Refresh and review those accounts individually.' : updatedIds.length + ' accounts updated.', updatedCount: updatedIds.length, updatedIds, failedIds });
};
// Export users to CSV
export const exportUsers = async (req, res) => {
  try {
    const filters = {
      search: req.query.search || '',
      role: req.query.role || '',
      status: req.query.status || ''
    };

    const csvData = await UserService.exportUsersToCSV(filters);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    res.send(csvData);
  } catch (error) {
    console.error("User export failed:", error.name);
    res.status(503).json({ success: false, message: 'Accounts could not be exported. Please retry.' });
  }
};

// Display admin appointments dashboard
export const adminAppointmentsPage = async (req, res) => {
  try {
    const search = searchTerm(req.query);
    const { rows, pagination } = await recordPage(Appointment, { where: withTextSearch({ status: 'scheduled' },search,['$BloodRequest.patientName$','$BloodRequest.hospitalName$','$BloodRequest.bloodType$','$Donor.fullName$','$Donor.mobileNumber$'], 'requestId'), include: [{ model: BloodRequest, required: true, where: { archivedAt: null } }, { model: Donor, attributes: ['id', 'fullName', 'email', 'bloodType', 'mobileNumber'] }], order: [['scheduledDate', 'ASC']] },req.query,req.path);
    const appointments = rows.map(a => ({ ...a.BloodRequest.toJSON(), id: a.requestId, requestId: a.requestId, appointmentId: a.id, version: a.version, scheduledDate: a.scheduledDate, donorConfirmed: a.donorConfirmed, requesterConfirmed: a.requesterConfirmed, donor: a.Donor?.toJSON(), unitsRemaining: unitsRemaining(a.BloodRequest) }));
    res.render('admin-appointments', { layout: 'admin', title: 'Appointments - VitalMatch Admin', isAppointments: true, appointments, pagination, search, error: null });
  } catch (error) {
    console.error('Appointments failed:', error.name);
    res.status(503).render('admin-appointments', { layout: 'admin', title: 'Appointments unavailable', isAppointments: true, appointments: [], error: 'Appointments could not be loaded. Please retry.' });
  }
};
