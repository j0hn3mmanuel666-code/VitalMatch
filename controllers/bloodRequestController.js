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

import { BloodRequest, sequelize } from "../models/bloodRequestModel.js";
import { Op } from "sequelize";
import { Notification } from "../models/notificationModel.js";
import { Donor } from "../models/donorModel.js";
import { User } from "../models/userModel.js";
import { Pledge, isCompatible } from "../models/pledgeModel.js";
import { getUserSettings } from "../models/userSettingModel.js";
import { AuditService } from "../services/auditService.js";
import { broadcastEmergency } from "../services/matchingService.js";
import { vitalMatchBlockchain } from "../services/blockchainService.js";
import { notifyNearestDonors } from "../services/matchingService.js";
await sequelize.sync();

// Display the blood request form (contact + hospital fields pre-filled from profile)
export const requestBloodPage = async (req, res) => {
  console.log(`🩸 [Request Blood Page] Accessed by user ${req.session?.userId || 'anonymous'}`);
  console.log(`🩸 [Session Check] sessionID: ${req.sessionID}`);
  console.log(`🩸 [Session Data]:`, req.session);

  const profile = req.session?.userId
    ? await User.findByPk(req.session.userId)
    : null;

  res.render("request-blood", {
    title: "Request Blood - VitalMatch",
    profile: profile ? profile.toJSON() : null
  });
};

// Simple blood request form (no JavaScript validation)
export const simpleRequestBloodPage = (req, res) => {
  console.log(`🩸 [Simple Request Blood Page] Accessed`);

  res.render("simple-blood-request", {
    title: "Request Blood - Simple - VitalMatch"
  });
};

// NEW: Fresh blood request page function
export const newRequestBloodPage = async (req, res) => {
  console.log(`🩸 [NEW Request Blood Page] Accessed by user ${req.session?.userId || 'anonymous'}`);

  const profile = req.session?.userId
    ? await User.findByPk(req.session.userId)
    : null;

  res.render("request-blood", {
    title: "Request Blood - VitalMatch",
    profile: profile ? profile.toJSON() : null
  });
};

// Display a single blood request (read-only)
export const viewBloodRequestPage = async (req, res) => {
  try {
    const requestId = req.params.id;

    // Build where clause - admins can view any request, users can only view their own
    const whereClause = { id: requestId };
    if (req.session.userRole !== 'admin') {
      const hasAccessToOwnRequest = { userId: req.session.userId };
      const hasDonorNotification = await Notification.findOne({
        where: {
          userId: req.session.userId,
          link: `/view-blood-request/${requestId}`
        }
      });

      // Hospitals reviewing a request that names their facility may view it
      let facilityReview = null;
      if (req.session.userRole === 'hospital') {
        const me = await User.findByPk(req.session.userId);
        const facilityName = (me?.hospitalName || "").trim().toLowerCase();
        if (facilityName) {
          facilityReview = await BloodRequest.findOne({
            where: {
              id: requestId,
              hospitalStatus: "pending",
              [Op.and]: [sequelize.where(sequelize.fn("LOWER", sequelize.col("hospitalName")), facilityName)]
            }
          });
        }
      }

      if (!hasDonorNotification && !facilityReview) {
        Object.assign(whereClause, hasAccessToOwnRequest);
      }
    }

    const request = await BloodRequest.findOne({
      where: whereClause
    });

    if (!request) {
      req.flash("error_msg", "Request not found or you don't have permission to view it");
      return res.redirect(req.session.userRole === 'admin' ? '/admin/requests' : '/my-requests');
    }

    const isOwner = request.userId === req.session.userId;
    const isAdminView = req.session.userRole === 'admin';

    // Pledge context for donors viewing someone else's active request.
    // Owners and admins also get the pledges list + count.
    let pledgeState = "hidden"; // hidden | offer | pledged | own | inactive | noblood | incompatible | nodonor
    let pledgeCount = 0;
    let pledges = [];
    const loadPledges = async () => {
      pledgeCount = await Pledge.count({ where: { requestId: request.id } });
      const rows = await Pledge.findAll({
        where: { requestId: request.id },
        include: [{ model: User, attributes: ["firstName", "lastName"] }],
        order: [["createdAt", "ASC"]]
      });
      pledges = await Promise.all(rows.map(async (r) => {
        const donor = await Donor.findOne({ where: { userId: r.userId }, attributes: ["id"] });
        return {
          name: `${r.User.firstName} ${r.User.lastName}`,
          bloodType: r.bloodType,
          when: r.createdAt,
          donorId: donor ? donor.id : null
        };
      }));
    };
    if (isAdminView) {
      await loadPledges();
    } else {
      pledgeCount = await Pledge.count({ where: { requestId: request.id } });
      if (isOwner || request.userId === null) {
        pledgeState = "own";
      } else if (request.status !== "active") {
        pledgeState = "inactive";
      } else {
        const donor = await Donor.findOne({ where: { userId: req.session.userId } });
        if (!donor) {
          pledgeState = "nodonor";
        } else if (!donor.isAvailable) {
          pledgeState = "unavailable";
        } else if (!isCompatible(donor.bloodType, request.bloodType)) {
          pledgeState = "incompatible";
        } else {
          const existing = await Pledge.findOne({ where: { requestId: request.id, userId: req.session.userId } });
          pledgeState = existing ? "pledged" : "offer";
        }
      }
      if (isOwner) {
        await loadPledges();
      }
    }

    res.render("view-blood-request", {
      title: "Blood Request Details - VitalMatch",
      request,
      isAdmin: isAdminView,
      isOwner,
      pledgeState,
      pledgeCount,
      pledges,
      emergencyActive: isEmergencyActive(request),
      canManageEmergency: isAdminView || isOwner
    });
  } catch (error) {
    console.error("Error fetching blood request:", error);
    res.render("view-blood-request", {
      title: "Blood Request Details - VitalMatch",
      request: null,
      isAdmin: false,
      isOwner: false,
      pledgeState: "hidden",
      pledgeCount: 0,
      pledges: [],
      emergencyActive: false,
      canManageEmergency: false
    });
  }
};

// Donor offers to donate for an active request
export const pledgeToDonate = async (req, res) => {
  try {
    const request = await BloodRequest.findByPk(req.params.id);
    if (!request || request.status !== "active") {
      req.flash("error_msg", "This request is no longer open for pledges");
      return res.redirect("/dashboard");
    }
    if (request.userId === req.session.userId) {
      req.flash("error_msg", "You cannot pledge for your own request");
      return res.redirect(`/view-blood-request/${request.id}`);
    }
    const donor = await Donor.findOne({ where: { userId: req.session.userId } });
    if (!donor || !donor.isAvailable || !isCompatible(donor.bloodType, request.bloodType)) {
      req.flash("error_msg", "You are not eligible to pledge for this request");
      return res.redirect(`/view-blood-request/${request.id}`);
    }

    await Pledge.findOrCreate({
      where: { requestId: request.id, userId: req.session.userId },
      defaults: { requestId: request.id, userId: req.session.userId, bloodType: donor.bloodType }
    });

    if (request.userId) {
      const prefs = await getUserSettings(request.userId);
      if (!prefs || prefs.notifyMatches) {
        await Notification.create({
          userId: request.userId,
          title: "New Donation Pledge",
          message: `A ${donor.bloodType} donor offered to donate for your blood request #${request.id}.`,
          type: "success",
          link: `/view-blood-request/${request.id}`
        });
      }
    }

    // Notify all admins so they can schedule the pledging donor
    const admins = await User.findAll({ where: { role: "admin" }, attributes: ["id"] });
    await Promise.all(admins.map(a => Notification.create({
      userId: a.id,
      title: "New Donation Pledge",
      message: `A ${donor.bloodType} donor pledged for request #${request.id} (${request.hospitalName}).`,
      type: "info",
      link: `/view-blood-request/${request.id}`
    }).catch(() => null)));

    req.flash("success_msg", "Thank you! Your pledge has been recorded. The requester has been notified.");
    res.redirect(`/view-blood-request/${request.id}`);
  } catch (error) {
    console.error("Pledge error:", error);
    req.flash("error_msg", "Could not record your pledge");
    res.redirect("/dashboard");
  }
};

// An escalation is live only while flagged, unexpired, and the request is active
export const isEmergencyActive = (r) => !!(
  r && r.isEmergency && r.emergencyExpiresAt &&
  new Date(r.emergencyExpiresAt) > new Date() && r.status === "active"
);

// Declare an emergency: jumps the queue, broadcasts to all matching donors.
// Owner of the request or admin only. Auto-expires after 6 hours.
export const escalateRequest = async (req, res) => {
  try {
    const request = await BloodRequest.findByPk(req.params.id);
    const isAdmin = req.session.userRole === "admin";
    if (!request || request.status !== "active") {
      req.flash("error_msg", "Only active requests can be escalated");
      return res.redirect(`/view-blood-request/${req.params.id}`);
    }
    if (!isAdmin && request.userId !== req.session.userId) {
      req.flash("error_msg", "You can only escalate your own requests");
      return res.redirect("/dashboard");
    }
    if (isEmergencyActive(request)) {
      req.flash("error_msg", "This request is already under emergency escalation");
      return res.redirect(`/view-blood-request/${request.id}`);
    }

    await request.update({
      isEmergency: true,
      emergencyAt: new Date(),
      emergencyExpiresAt: new Date(Date.now() + 6 * 3600000)
    });
    await AuditService.logAction(
      req.session.userId, "ESCALATE_EMERGENCY", "BloodRequests", request.id,
      null, { isEmergency: true }, AuditService.getRequestContext(req)
    );

    // Broadcast in the background; respond immediately
    broadcastEmergency(request).then(n => {
      console.log(`🚨 Emergency broadcast for request ${request.id} reached ${n} donors`);
    }).catch(err => console.error("Emergency broadcast failed:", err.message));

    req.flash("success_msg", "Emergency declared. All matching donors are being notified now.");
    res.redirect(`/view-blood-request/${request.id}`);
  } catch (error) {
    console.error("Escalate error:", error);
    req.flash("error_msg", "Could not declare emergency");
    res.redirect("/dashboard");
  }
};

// Stand down an emergency (owner or admin)
export const clearEmergency = async (req, res) => {
  try {
    const request = await BloodRequest.findByPk(req.params.id);
    const isAdmin = req.session.userRole === "admin";
    if (!request || (!isAdmin && request.userId !== req.session.userId)) {
      req.flash("error_msg", "Request not found");
      return res.redirect("/dashboard");
    }
    await request.update({ isEmergency: false, emergencyAt: null, emergencyExpiresAt: null });
    await AuditService.logAction(
      req.session.userId, "CLEAR_EMERGENCY", "BloodRequests", request.id,
      null, { isEmergency: false }, AuditService.getRequestContext(req)
    );
    req.flash("success_msg", "Emergency cleared. The request returns to the normal queue.");
    res.redirect(`/view-blood-request/${request.id}`);
  } catch (error) {
    console.error("Clear emergency error:", error);
    req.flash("error_msg", "Could not clear emergency");
    res.redirect("/dashboard");
  }
};

// Donor withdraws their pledge
export const withdrawPledge = async (req, res) => {
  try {
    await Pledge.destroy({ where: { requestId: req.params.id, userId: req.session.userId } });
    req.flash("success_msg", "Your pledge has been withdrawn");
    res.redirect(`/view-blood-request/${req.params.id}`);
  } catch (error) {
    console.error("Withdraw pledge error:", error);
    req.flash("error_msg", "Could not withdraw your pledge");
    res.redirect("/dashboard");
  }
};

// Handle blood request submission
export const submitBloodRequest = async (req, res) => {
  try {
    console.log(`🩸 [Submit Blood Request] Starting submission...`);
    console.log(`🩸 [Session Check] userId: ${req.session?.userId}, sessionID: ${req.sessionID}`);
    console.log(`🩸 [Form Data]:`, req.body);

    const {
    patientName,
    patientAge,
      bloodType,
      unitsRequired,
      indicationOfTransfusion,
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

    // Process blood components data
    let bloodComponents = [];

    // Handle different ways the form data might come in
    let selectedComponents = req.body['bloodComponents[]'] || req.body.bloodComponents || [];

    // If it's a string (single value or comma-separated), convert to array
    if (typeof selectedComponents === 'string') {
      selectedComponents = selectedComponents.includes(',')
        ? selectedComponents.split(',')
        : [selectedComponents];
    }

    // Ensure it's an array and flatten if needed
    let componentsArray = Array.isArray(selectedComponents) ? selectedComponents : [selectedComponents];

    // Handle case where array contains comma-separated strings
    componentsArray = componentsArray.flatMap(item =>
      typeof item === 'string' && item.includes(',') ? item.split(',') : item
    );

    console.log(`🩸 [Blood Components] Selected:`, componentsArray);

    // Build blood components array with volumes
    componentsArray.forEach(component => {
      if (component && component.trim()) {
        const volumeField = component.trim() + 'Volume';
        const volume = req.body[volumeField];
        if (volume && volume.trim()) {
          bloodComponents.push({
            type: component.trim(),
            volume: volume.trim()
          });
        }
      }
    });

    console.log(`🩸 [Blood Components] Processed:`, bloodComponents);

    // Validate required fields
    if (!patientName || !patientAge || !bloodType || !unitsRequired ||
      !hospitalName || !hospitalAddress || !city || !province ||
      !contactPerson || !contactNumber || !email || !urgency || !requiredByDate ||
      !indicationOfTransfusion || bloodComponents.length === 0) {
      console.log(`❌ [Validation Failed] Missing required fields`);
      req.flash("error_msg", "Please fill in all required fields including indication of transfusion and at least one blood component");
      return res.redirect("/new-blood-request");
    }

    // Submitting a request requires a logged-in account (routes also enforce this).
    // Guest submissions are no longer accepted.
    if (!req.session?.userId) {
      req.flash("error_msg", "Please log in to submit a blood request");
      return res.redirect("/login");
    }
    const userId = req.session.userId;
    console.log(`🩸 [Auth Status] Authenticated userId: ${userId}`);

    // NOTE: the typed hospitalName is always kept as-is. If it matches a
    // verified hospital account, that facility is asked to review/approve
    // the request (see review logic after creation).

    // Save to database
    const newRequest = await BloodRequest.create({
      patientName,
      patientAge: parseInt(patientAge),
      bloodType,
      unitsRequired: parseInt(unitsRequired),
      bloodComponents: bloodComponents, // Store as JSON
      indicationOfTransfusion,
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
      notes: notes || 'Blood request submitted via VitalMatch',
      status: "active",
      userId: userId
    });

    console.log(`✅ [Database] Blood request created with ID: ${newRequest.id}`);

    // Facility review: if the typed hospital matches a verified hospital account
    // (and the submitter is not that facility), the facility must approve first.
    try {
      const facilities = await User.findAll({
        where: { role: "hospital", isActive: true },
        attributes: ["id", "hospitalName"]
      });
      const typed = (hospitalName || "").trim().toLowerCase();
      const match = facilities.find(f => (f.hospitalName || "").trim().toLowerCase() === typed && typed !== "");
      const selfFacility = match && Number(match.id) === Number(userId);
      if (match && !selfFacility) {
        await newRequest.update({ hospitalId: null, hospitalStatus: "pending" });
        await Notification.create({
          userId: match.id,
          title: "Review Patient Request",
          message: `A new blood request #${newRequest.id} names your facility (${match.hospitalName}). Please confirm whether this patient is really yours.`,
          type: "alert",
          link: `/hospital/patients`
        });
        console.log(`🏥 [Facility Review] Request ${newRequest.id} pending review by facility ${match.id}`);
      } else {
        await newRequest.update({
          hospitalId: selfFacility ? match.id : null,
          hospitalStatus: "approved"
        });
      }
    } catch (reviewError) {
      console.error("Facility review matching failed (non-fatal):", reviewError.message);
    }

    // Add to blockchain
    console.log('🔗 [Blockchain] Adding blood request to blockchain...');
    vitalMatchBlockchain.addRequestRecord(newRequest.id, {
      patientId: patientName, // In production, use proper patient ID
      bloodType,
      unitsRequired: parseInt(unitsRequired),
      urgency,
      hospitalName,
      status: "active"
    });

    // Mine the blockchain (in production, this might be done periodically)
    const miningResult = vitalMatchBlockchain.minePendingTransactions();
    console.log(`⛏️ [Blockchain] Mining result:`, miningResult);

    const nearestDonors = await notifyNearestDonors(newRequest);
    console.log(`🔔 Notified ${nearestDonors.length} nearest matching donor(s)`);

    req.flash("success_msg", "Blood request submitted successfully and recorded on blockchain! Qualified donors will be notified shortly.");

    res.redirect(`/view-blood-request/${newRequest.id}`);

  } catch (error) {
    console.error("❌ [Error] submitting blood request:", error);
    req.flash("error_msg", "An error occurred while submitting your request. Please try again.");
    res.redirect("/new-blood-request");
  }
};
