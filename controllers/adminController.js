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
import { Notification } from "../models/notificationModel.js";
import { getUserSettings } from "../models/userSettingModel.js";
import { createScheduleToken } from "../models/scheduleTokenModel.js";
import { Op } from "sequelize";
import { notifyNearestDonors } from "../services/matchingService.js";

// Display the admin dashboard
export const adminDashboardPage = async (req, res) => {
  try {
    // Get total counts
    const totalRequests = await BloodRequest.count();
    const activeDonors = await Donor.count({ where: { isAvailable: true } });
    const successfulMatches = await BloodRequest.count({ where: { status: 'fulfilled' } });

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
        livesSaved: successfulMatches * 2 // Estimate
      },
      monthlyRequests: JSON.stringify(monthlyRequests),
      bloodTypeDistribution: JSON.stringify(bloodTypeDistribution),
      monthlyDonors: JSON.stringify(monthlyDonors),
      statusBreakdown: JSON.stringify(statusBreakdown),
      recentRequests,
      topHospitals,
      regionalDistribution
    });
  } catch (error) {
    console.error("Error fetching admin dashboard data:", error);
    res.render("admin-dashboard", {
      layout: "admin",
      title: "Admin Dashboard - VitalMatch",
      isDashboard: true,
      stats: { totalRequests: 0, activeDonors: 0, successfulMatches: 0, livesSaved: 0 },
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
    const filter = req.query.filter;
    const whereClause = {};

    if (filter && ['active', 'fulfilled', 'cancelled', 'pending'].includes(filter)) {
      whereClause.status = filter;
    }

    const requests = await BloodRequest.findAll({
      where: whereClause,
      order: [['isEmergency', 'DESC'], ['createdAt', 'DESC']]
    });

    // Pledge counts per request (single grouped query)
    const { Pledge } = await import("../models/pledgeModel.js");
    const pledgeRows = await Pledge.findAll({
      attributes: ["requestId", [sequelize.fn("COUNT", sequelize.col("id")), "cnt"]],
      group: ["requestId"],
      raw: true
    });
    const pledgeCounts = {};
    pledgeRows.forEach(r => { pledgeCounts[r.requestId] = parseInt(r.cnt, 10); });

    // For each request, find matching donors
    const requestsWithDonors = await Promise.all(requests.map(async (request) => {
      const donorWhereClause = {
        bloodType: request.bloodType,
        isAvailable: true
      };

      // Exclude the requester themselves from being a donor match
      if (request.userId) {
        donorWhereClause.userId = { [Op.ne]: request.userId };
      }

      const matchingDonors = await Donor.findAll({
        where: donorWhereClause,
        limit: 10
      });

      const emergencyActive = !!(
        request.isEmergency && request.emergencyExpiresAt &&
        new Date(request.emergencyExpiresAt) > new Date() && request.status === "active"
      );
      return {
        ...request.toJSON(),
        pledgeCount: pledgeCounts[request.id] || 0,
        emergencyActive,
        matchingDonorsCount: matchingDonors.length,
        matchingDonors: matchingDonors.map(d => ({
          id: d.id,
          userId: d.userId,
          fullName: d.fullName,
          mobileNumber: d.mobileNumber,
          email: d.email,
          city: d.city,
          province: d.province
        }))
      };
    }));

    res.render("admin-requests", {
      layout: "admin",
      title: "Manage Requests - VitalMatch Admin",
      isRequests: true,
      requests: requestsWithDonors,
      filter
    });
  } catch (error) {
    console.error("Error fetching requests:", error);
    res.render("admin-requests", {
      layout: "admin",
      title: "Manage Requests - VitalMatch Admin",
      isRequests: true,
      requests: [],
      filter: null
    });
  }
};

// Display admin donors page
export const adminDonorsPage = async (req, res) => {
  try {
    const filter = req.query.filter;
    const bloodType = req.query.bloodType;
    const whereClause = {};

    if (filter === 'available') {
      whereClause.isAvailable = true;
    } else if (filter === 'unavailable') {
      whereClause.isAvailable = false;
    }

    if (bloodType) {
      whereClause.bloodType = bloodType;
    }

    const donors = await Donor.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    // Calculate age for each donor
    const donorsWithAge = donors.map(donor => {
      const birthDate = new Date(donor.dateOfBirth);
      const age = Math.floor((new Date() - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
      return {
        ...donor.toJSON(),
        age
      };
    });

    res.render("admin-donors", {
      layout: "admin",
      title: "Manage Donors - VitalMatch Admin",
      isDonors: true,
      donors: donorsWithAge,
      filter,
      bloodType
    });
  } catch (error) {
    console.error("Error fetching donors:", error);
    res.render("admin-donors", {
      layout: "admin",
      title: "Manage Donors - VitalMatch Admin",
      isDonors: true,
      donors: [],
      filter: null
    });
  }
};

// Display admin hospitals page
export const adminHospitalsPage = async (req, res) => {
  try {
    // Get hospital statistics
    const hospitalStats = await BloodRequest.findAll({
      attributes: [
        'hospitalName',
        'city',
        'province',
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalCount'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'active' THEN 1 ELSE 0 END")), 'activeCount'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'fulfilled' THEN 1 ELSE 0 END")), 'fulfilledCount']
      ],
      group: ['hospitalName', 'city', 'province'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
      raw: true
    });

    // Registered hospital accounts (includes those with zero requests)
    const { User } = await import("../models/userModel.js");
    const hospitalUsers = await User.findAll({
      where: { role: "hospital" },
      attributes: ["id", "firstName", "lastName", "email", "phone", "address", "isActive", "emailVerified", "createdAt"],
      order: [["createdAt", "DESC"]]
    });

    res.render("admin-hospitals", {
      layout: "admin",
      title: "Manage Hospitals - VitalMatch Admin",
      isHospitals: true,
      hospitals: hospitalStats,
      hospitalUsers
    });
  } catch (error) {
    console.error("Error fetching hospitals:", error);
    res.render("admin-hospitals", {
      layout: "admin",
      title: "Manage Hospitals - VitalMatch Admin",
      isHospitals: true,
      hospitals: [],
      hospitalUsers: []
    });
  }
};

// Verify a hospital account (activate) or suspend it (deactivate)
export const setHospitalStatus = async (req, res) => {
  try {
    const { User } = await import("../models/userModel.js");
    const hospital = await User.findOne({ where: { id: req.params.id, role: "hospital" } });
    if (!hospital) {
      return res.status(404).json({ success: false, message: "Hospital account not found" });
    }
    const activate = req.params.action === "verify";
    if (req.params.action !== "verify" && req.params.action !== "suspend") {
      return res.status(400).json({ success: false, message: "Invalid action" });
    }
    await hospital.update({ isActive: activate });
    await AuditService.logAction(
      req.session.userId,
      activate ? "HOSPITAL_VERIFY" : "HOSPITAL_SUSPEND",
      "Users",
      hospital.id,
      null,
      { isActive: activate },
      AuditService.getRequestContext(req)
    );
    res.json({ success: true, isActive: activate });
  } catch (error) {
    console.error("Set hospital status error:", error);
    res.status(500).json({ success: false, message: "Could not update hospital status" });
  }
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
    const availableDonors = await Donor.count({ where: { isAvailable: true } });
    const unavailableDonors = await Donor.count({ where: { isAvailable: false } });

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

    // Real average response time: request creation to fulfillment
    const fulfilledForAvg = await BloodRequest.findAll({
      where: { status: "fulfilled" },
      attributes: ["createdAt", "updatedAt"],
      raw: true
    });
    let avgResponseTime = "N/A";
    if (fulfilledForAvg.length > 0) {
      const totalMs = fulfilledForAvg.reduce((sum, r) => sum + (new Date(r.updatedAt) - new Date(r.createdAt)), 0);
      const avgHours = totalMs / fulfilledForAvg.length / 3600000;
      avgResponseTime = avgHours < 48
        ? `${Math.max(1, Math.round(avgHours))}h`
        : `${Math.round(avgHours / 24)}d`;
    }

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
        livesSaved: fulfilledRequests * 2,
        successRate,
        avgResponseTime
      },
      bloodTypeReport,
      monthlyReport
    };
  } catch (error) {
    console.error("Error generating reports data:", error);
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
    console.error("Error generating reports:", error);
    res.render("admin-reports", {
      layout: "admin",
      title: "Reports - VitalMatch Admin",
      isReports: true,
      summary: {
        totalRequests: 0,
        activeRequests: 0,
        fulfilledRequests: 0,
        cancelledRequests: 0,
        totalDonors: 0,
        availableDonors: 0,
        unavailableDonors: 0,
        livesSaved: 0,
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
    console.error("Error exporting reports:", error);
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
export const adminNewBloodRequestPage = (req, res) => {
  res.render("admin-new-request", {
    layout: "admin",
    title: "Create New Blood Request - VitalMatch Admin",
    isRequests: true
  });
};

// Handle admin blood request creation
export const createBloodRequest = async (req, res) => {
  try {
    const {
      patientName,
      patientAge,
      bloodType,
      unitsRequired,
      hospitalName,
      hospitalAddress,
      city,
      province,
      contactPerson,
      contactNumber,
      email,
      urgency,
      requiredByDate,
      notes,
      latitude,
      longitude
    } = req.body;

    // Validate required fields
    if (!patientName || !patientAge || !bloodType || !unitsRequired ||
      !hospitalName || !hospitalAddress || !city || !province ||
      !contactPerson || !contactNumber || !email || !urgency || !requiredByDate) {
      req.flash("error_msg", "Please fill in all required fields");
      return res.redirect("/admin/new-blood-request");
    }

    // Create the blood request
    const newRequest = await BloodRequest.create({
      patientName,
      patientAge: parseInt(patientAge),
      bloodType,
      unitsRequired: parseInt(unitsRequired),
      hospitalName,
      hospitalAddress,
      city,
      province,
      contactPerson,
      contactNumber,
      email,
      urgency,
      requiredByDate,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      notes: notes || 'Blood request created by admin',
      status: "active",
      userId: req.session.userId // Admin user ID
    });

    console.log(`✅ [Admin] Blood request created with ID: ${newRequest.id}`);

    // Add to blockchain
    console.log('🔗 [Admin] Adding blood request to blockchain...');
    vitalMatchBlockchain.addRequestRecord(newRequest.id, {
      patientId: patientName,
      bloodType,
      unitsRequired: parseInt(unitsRequired),
      urgency,
      hospitalName,
      status: "active",
      createdBy: "admin"
    });

    // Mine the blockchain
    const miningResult = vitalMatchBlockchain.minePendingTransactions();
    console.log(`⛏️ [Admin] Mining result:`, miningResult);

    const nearestDonors = await notifyNearestDonors(newRequest);
    console.log(`🔔 [Admin] Notified ${nearestDonors.length} nearest matching donor(s)`);

    // Log audit trail
    await AuditService.logAction(
      req.session.userId,
      'CREATE_BLOOD_REQUEST',
      'BloodRequest',
      newRequest.id,
      null,
      newRequest.toJSON(),
      AuditService.getRequestContext(req)
    );

    req.flash("success_msg", "Blood request created successfully and recorded on blockchain! Qualified donors will be notified.");
    res.redirect(`/view-blood-request/${newRequest.id}`);

  } catch (error) {
    console.error("❌ [Admin] Error creating blood request:", error);
    req.flash("error_msg", "An error occurred while creating the blood request. Please try again.");
    res.redirect("/admin/new-blood-request");
  }
};

// Fulfill or Schedule a blood request
export const fulfillRequest = async (req, res) => {
  try {
    const requestId = req.params.id;
    const { donorId, unitsProvided, scheduledDate, notes } = req.body;

    const request = await BloodRequest.findByPk(requestId);

    if (!request) {
      return res.json({ success: false, message: 'Request not found' });
    }

    if (request.status === 'fulfilled') {
      return res.json({ success: false, message: 'Request already fulfilled' });
    }

    // Determine the new status based on whether it is scheduled in the future or fulfilled now
    // The user prefers keeping it simple, but we added 'scheduled' to the DB enum.
    let newStatus = 'fulfilled';
    let isScheduled = false;

    if (scheduledDate) {
      const scheduleTime = new Date(scheduledDate);
      if (scheduleTime > new Date()) {
        newStatus = 'scheduled';
        isScheduled = true;
      }
    }

    const parsedDonorId = donorId ? parseInt(donorId) : null;

    // Update request status and tracking fields (fulfill/schedule clears any escalation)
    await request.update({
      status: newStatus,
      assignedDonorId: parsedDonorId,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      fulfillmentNotes: notes || null,
      isEmergency: false,
      emergencyAt: null,
      emergencyExpiresAt: null
    });

    // Add fulfillment record to blockchain
    console.log('🔗 Adding fulfillment record to blockchain...');
    vitalMatchBlockchain.addFulfillmentRecord(requestId, parsedDonorId || 'admin-fulfilled', {
      units: unitsProvided || request.unitsRequired,
      matchingScore: 100, // Perfect match for admin fulfillment
      fulfillmentDate: scheduledDate || new Date().toISOString(),
      notes: notes || '',
      verifiedBy: req.session.userId
    });

    // Mine the blockchain
    vitalMatchBlockchain.minePendingTransactions();

    // Send email notification to donor if selected (background: never block the response)
    if (parsedDonorId) {
      try {
        const donor = await Donor.findByPk(parsedDonorId);
        if (donor && donor.email) {
          const { emailService } = await import('../services/emailService.js');
          const donorToken = await createScheduleToken(request.id, 'donor');
          const donorConfirmUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/schedule-confirm/${donorToken.token}`;
          emailService.sendDonationScheduleEmail(
            donor.email,
            donor.fullName,
            request,
            scheduledDate,
            notes,
            donorConfirmUrl
          ).then(result => {
            console.log(`📧 Donor email ${result.success ? "sent" : "FAILED"}: ${donor.email}`);
          }).catch(err => console.error("Background donor email failed:", err.message));
          console.log(`📧 Donor email queued for: ${donor.email}`);

          // Add in-app notification for the donor (respect notification prefs)
          if (donor.userId) {
            const donorPrefs = await getUserSettings(donor.userId);
            if (!donorPrefs || donorPrefs.notifyAppointments) {
              await Notification.create({
                userId: donor.userId,
                title: "Donation Appointment Scheduled",
                message: `You have been scheduled for a blood donation appointment for request #${request.id}. Please confirm your availability.`,
                type: "alert",
                link: `/schedule-confirm/${donorToken.token}`
              });
              console.log(`🔔 In-app notification created for donor userId: ${donor.userId}`);
            }
          }
        }
      } catch (err) {
        console.error("Error sending schedule notification:", err);
      }
    }

    // Send email notification to requester (background: never block the response)
    try {
      if (request.email) {
        const { emailService } = await import('../services/emailService.js');
        const requesterToken = await createScheduleToken(request.id, 'requester');
        const requesterConfirmUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/schedule-confirm/${requesterToken.token}`;
        emailService.sendRequesterScheduleEmail(
          request.email,
          request.contactPerson,
          request,
          scheduledDate,
          notes,
          requesterConfirmUrl
        ).then(result => {
          console.log(`📧 Requester email ${result.success ? "sent" : "FAILED"}: ${request.email}`);
        }).catch(err => console.error("Background requester email failed:", err.message));
        console.log(`📧 Requester email queued for: ${request.email}`);

        // Add in-app notification for the requester (respect notification prefs)
        if (request.userId) {
          const requesterPrefs = await getUserSettings(request.userId);
          if (!requesterPrefs || requesterPrefs.notifyAppointments) {
            await Notification.create({
              userId: request.userId,
              title: "Blood Request Scheduled",
              message: `Your blood request #${request.id} has been scheduled for fulfillment. Please confirm the schedule details.`,
              type: "success",
              link: `/schedule-confirm/${requesterToken.token}`
            });
            console.log(`🔔 In-app notification created for requester userId: ${request.userId}`);
          }
        }
      }
    } catch (err) {
      console.error("Error sending requester schedule notification:", err);
    }

    res.json({
      success: true,
      message: isScheduled ? 'Donation scheduled successfully. Notifications sent.' : 'Request marked as fulfilled and recorded on blockchain.'
    });
  } catch (error) {
    console.error("Error fulfilling request:", error);
    res.json({ success: false, message: 'Error processing request' });
  }
};

// Delete a blood request
export const deleteRequest = async (req, res) => {
  try {
    const requestId = req.params.id;

    const request = await BloodRequest.findByPk(requestId);

    if (!request) {
      return res.json({ success: false, message: 'Request not found' });
    }

    // Store request data for audit log before deletion
    const requestData = request.toJSON();

    // Delete the request
    await request.destroy();

    // Log audit trail
    await AuditService.logAction(
      req.session.userId,
      'DELETE_BLOOD_REQUEST',
      'BloodRequest',
      requestId,
      requestData,
      null,
      AuditService.getRequestContext(req)
    );

    console.log(`🗑️ [Admin] Blood request ${requestId} deleted by admin ${req.session.userId}`);

    res.json({
      success: true,
      message: 'Blood request deleted successfully'
    });
  } catch (error) {
    console.error("Error deleting request:", error);
    res.json({ success: false, message: 'Error deleting request' });
  }
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
    console.error("Error loading user management page:", error);
    res.render("admin-users", {
      layout: "admin",
      title: "User Management - VitalMatch Admin",
      isUsers: true
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
    console.error("Error fetching users:", error);
    res.json({ success: false, message: error.message || 'Error fetching users' });
  }
};

// Get single user details
export const getUserDetails = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await UserService.getUserById(userId);

    res.json({ success: true, user });
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.json({ success: false, message: error.message || 'Error fetching user details' });
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
    console.error("Error creating user:", error);
    res.json({ success: false, message: error.message || 'Error creating user' });
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
    console.error("Error updating user:", error);
    res.json({ success: false, message: error.message || 'Error updating user' });
  }
};

// Delete user (soft delete)
export const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const adminId = req.session.userId; // Session stores userId (see authController loginUser)
    const context = AuditService.getRequestContext(req);

    await UserService.deleteUser(userId, adminId, context);

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.json({ success: false, message: error.message || 'Error deleting user' });
  }
};

// Bulk update users (only role and active status may be changed in bulk)
export const bulkUpdateUsers = async (req, res) => {
  try {
    const { userIds, updates } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.json({ success: false, message: 'No users selected' });
    }

    const allowedRoles = ['user', 'donor', 'hospital', 'hospital_admin', 'admin'];
    const safeUpdates = {};
    if (updates && typeof updates.role === 'string' && allowedRoles.includes(updates.role)) {
      safeUpdates.role = updates.role;
    }
    if (updates && typeof updates.isActive === 'boolean') {
      safeUpdates.isActive = updates.isActive;
    }
    if (Object.keys(safeUpdates).length === 0) {
      return res.json({ success: false, message: 'No valid bulk changes provided' });
    }

    // Never let an admin lock themselves out
    const targets = userIds.map(Number).filter(id => id !== req.session.userId);
    if (targets.length === 0) {
      return res.json({ success: false, message: 'You cannot change your own role or status in bulk' });
    }

    const result = await User.update(safeUpdates, {
      where: { id: targets }
    });

    await AuditService.logBulkOperation(
      "update",
      targets,
      req.session.userId,
      AuditService.getRequestContext(req)
    );

    res.json({
      success: true,
      message: `${result[0]} users updated successfully`,
      updatedCount: result[0]
    });
  } catch (error) {
    console.error("Error bulk updating users:", error);
    res.json({ success: false, message: 'Error updating users' });
  }
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
    console.error("Error exporting users:", error);
    res.json({ success: false, message: 'Error exporting users' });
  }
};

// Display admin appointments dashboard
export const adminAppointmentsPage = async (req, res) => {
  try {
    // Get scheduled requests
    const appointments = await BloodRequest.findAll({
      where: {
        status: 'scheduled'
      },
      order: [['scheduledDate', 'ASC']]
    });

    // For each appointment, fetch the assigned donor if any
    const appointmentsWithDonors = await Promise.all(appointments.map(async (appointment) => {
      let donor = null;
      if (appointment.assignedDonorId) {
        donor = await Donor.findByPk(appointment.assignedDonorId);
      }

      return {
        ...appointment.toJSON(),
        assignedDonor: donor ? donor.toJSON() : null
      };
    }));

    res.render("admin-appointments", {
      layout: "admin",
      title: "Appointments Dashboard - VitalMatch Admin",
      isAppointments: true,
      appointments: appointmentsWithDonors
    });
  } catch (error) {
    console.error("Error fetching appointments:", error);
    res.render("admin-appointments", {
      layout: "admin",
      title: "Appointments Dashboard - VitalMatch Admin",
      isAppointments: true,
      appointments: []
    });
  }
};
