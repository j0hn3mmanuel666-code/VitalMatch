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
import { Notification } from "../models/notificationModel.js";
import { vitalMatchBlockchain } from "../services/blockchainService.js";
import { notifyNearestDonors } from "../services/matchingService.js";
await sequelize.sync();

// Display the blood request form
export const requestBloodPage = (req, res) => {
  console.log(`🩸 [Request Blood Page] Accessed by user ${req.session?.userId || 'anonymous'}`);
  console.log(`🩸 [Session Check] sessionID: ${req.sessionID}`);
  console.log(`🩸 [Session Data]:`, req.session);

  res.render("request-blood", {
    title: "Request Blood - VitalMatch"
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
export const newRequestBloodPage = (req, res) => {
  console.log(`🩸 [NEW Request Blood Page] Accessed by user ${req.session?.userId || 'anonymous'}`);

  res.render("request-blood", {
    title: "Request Blood - VitalMatch"
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

      if (!hasDonorNotification) {
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

    res.render("view-blood-request", {
      title: "Blood Request Details - VitalMatch",
      request,
      isAdmin: req.session.userRole === 'admin'
    });
  } catch (error) {
    console.error("Error fetching blood request:", error);
    res.render("view-blood-request", {
      title: "Blood Request Details - VitalMatch",
      request: null,
      isAdmin: false
    });
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

    // Determine userId - only use session if user is actually authenticated
    const isAuthenticated = req.session?.userId && req.session?.userRole;
    const userId = isAuthenticated ? req.session.userId : null;
    console.log(`🩸 [Auth Status] Authenticated: ${isAuthenticated}, userId: ${userId || 'guest'}`);
    console.log(`🩸 [Session Data]:`, {
      userId: req.session?.userId,
      userRole: req.session?.userRole,
      sessionID: req.sessionID
    });

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

    // Redirect based on authentication status
    if (isAuthenticated) {
      res.redirect(`/view-blood-request/${newRequest.id}`);
    } else {
      res.redirect(`/?success=true&requestId=${newRequest.id}`);
    }

  } catch (error) {
    console.error("❌ [Error] submitting blood request:", error);
    req.flash("error_msg", "An error occurred while submitting your request. Please try again.");
    res.redirect("/new-blood-request");
  }
};
