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

import { Donor, sequelize } from "../models/donorModel.js";
import { BloodRequest } from "../models/bloodRequestModel.js";
import { vitalMatchBlockchain } from "../services/blockchainService.js";
await sequelize.sync();

// Display the donor profile form
export const donorProfilePage = (req, res) => {
  res.render("donor-profile", {
    title: "Donor Profile - VitalMatch"
  });
};

// Display the donor profile view (read-only)
export const viewDonorProfilePage = async (req, res) => {
  console.log(`👤 [View Donor Profile] Accessed by user ${req.session.userId}`);
  console.log(`👤 [Session Check] sessionID: ${req.sessionID}`);
  console.log(`👤 [Session Data]:`, req.session);

  try {
    // Check if user is logged in
    if (!req.session.userId) {
      console.log("❌ [Donor Profile] No session userId found - user not logged in");
      req.flash("error_msg", "Please log in to view your donor profile");
      return res.redirect("/login");
    }

    console.log("✅ [Donor Profile] Viewing donor profile for userId:", req.session.userId);

    const donor = await Donor.findOne({
      where: { userId: req.session.userId },
      order: [['createdAt', 'DESC']]
    });

    console.log("🔍 [Donor Profile] Donor found:", donor ? `Yes (ID: ${donor.id})` : "No");

    // If no donor found, check if any donors exist in database
    if (!donor) {
      const allDonors = await Donor.findAll();
      console.log(`📊 [Donor Profile] Total donors in database: ${allDonors.length}`);
      if (allDonors.length > 0) {
        console.log("📋 [Donor Profile] Sample donor userIds:", allDonors.map(d => d.userId).slice(0, 5));
      }
    }

    console.log("🎯 [Donor Profile] Rendering view-donor-profile page");
    res.render("view-donor-profile", {
      title: "My Donor Profile - VitalMatch",
      donor
    });
  } catch (error) {
    console.error("❌ [Donor Profile] Error fetching donor profile:", error);
    res.render("view-donor-profile", {
      title: "My Donor Profile - VitalMatch",
      donor: null
    });
  }
};

// Handle donor profile submission
export const updateDonorProfile = async (req, res) => {
  try {
    console.log("Session userId:", req.session.userId); // Debug log
    console.log("Form data received:", req.body); // Debug log

    const {
      fullName,
      dateOfBirth,
      gender,
      bloodType,
      weight,
      height,
      mobileNumber,
      email,
      address,
      city,
      province,
      zipCode,
      lastDonationDate,
      medicalConditions,
      isAvailable,
      emergencyContactName,
      emergencyContactNumber,
      emergencyContactRelationship,
      latitude,
      longitude
    } = req.body;

    // Validate required fields
    if (!fullName || !dateOfBirth || !gender || !bloodType || !weight || !height ||
      !mobileNumber || !email || !address || !city || !province || !zipCode ||
      !emergencyContactName || !emergencyContactNumber || !emergencyContactRelationship) {
      req.flash("error_msg", "Please fill in all required fields");
      return res.redirect("/donor-profile");
    }

    // Validate weight (must be at least 50kg)
    if (parseInt(weight) < 50) {
      req.flash("error_msg", "Donors must weigh at least 50 kg to be eligible");
      return res.redirect("/donor-profile");
    }

    // Save to database
    const newDonor = await Donor.create({
      fullName,
      dateOfBirth,
      gender,
      bloodType,
      weight,
      height,
      mobileNumber,
      email,
      address,
      city,
      province,
      zipCode,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      lastDonationDate: lastDonationDate || null,
      medicalConditions,
      isAvailable: isAvailable === 'on',
      emergencyContactName,
      emergencyContactNumber,
      emergencyContactRelationship,
      userId: req.session.userId
    });

    // Add donor registration to blockchain
    console.log('🔗 Adding donor registration to blockchain...');
    vitalMatchBlockchain.addDonationRecord(req.session.userId, {
      bloodType,
      units: 0, // Initial registration, no donation yet
      location: `${city}, ${province}`,
      medicalChecks: {
        weight: weight,
        eligibility: parseInt(weight) >= 50,
        registrationDate: new Date().toISOString()
      }
    });

    // Mine the blockchain
    vitalMatchBlockchain.minePendingTransactions();

    console.log("Donor profile created:", newDonor.id); // Debug log
    req.flash("success_msg", "Donor profile created successfully and registered on blockchain!");
    res.redirect("/view-donor-profile");

  } catch (error) {
    console.error("Error updating donor profile:", error);
    req.flash("error_msg", "An error occurred while updating your profile. Please try again.");
    res.redirect("/donor-profile");
  }
};

// Display my requests page
export const myRequestsPage = async (req, res) => {
  try {
    const filter = req.query.filter; // Get filter from query params
    const whereClause = { userId: req.session.userId };

    // Apply filter if provided
    if (filter && ['active', 'fulfilled', 'cancelled', 'pending'].includes(filter)) {
      whereClause.status = filter;
    }

    const requests = await BloodRequest.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    res.render("my-requests", {
      title: "My Requests - VitalMatch",
      requests,
      filter
    });
  } catch (error) {
    console.error("Error fetching requests:", error);
    res.render("my-requests", {
      title: "My Requests - VitalMatch",
      requests: [],
      filter: null
    });
  }
};

// Cancel a blood request
export const cancelRequest = async (req, res) => {
  try {
    const requestId = req.params.id;

    // Find the request and verify it belongs to the user
    const request = await BloodRequest.findOne({
      where: {
        id: requestId,
        userId: req.session.userId
      }
    });

    if (!request) {
      req.flash("error_msg", "Request not found or you don't have permission to cancel it");
      return res.redirect("/my-requests");
    }

    // Check if request is already cancelled or fulfilled
    if (request.status === 'cancelled') {
      req.flash("error_msg", "This request is already cancelled");
      return res.redirect("/my-requests");
    }

    if (request.status === 'fulfilled') {
      req.flash("error_msg", "Cannot cancel a fulfilled request");
      return res.redirect("/my-requests");
    }

    // Update status to cancelled
    await request.update({ status: 'cancelled' });

    req.flash("success_msg", "Blood request cancelled successfully");
    res.redirect("/my-requests");

  } catch (error) {
    console.error("Error cancelling request:", error);
    req.flash("error_msg", "An error occurred while cancelling the request");
    res.redirect("/my-requests");
  }
};
