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

import { Donor } from "../models/donorModel.js";
import { BloodRequest } from "../models/bloodRequestModel.js";
import { User } from "../models/userModel.js";
import { Fulfillment } from "../models/workflowEventModel.js";
import { AuditService } from "../services/auditService.js";
import { donationIntervalDays, isDonorReady, isDonorAgeEligible, parseBirthDate, unitsRemaining } from "../services/coordinationPolicy.js";
import { cancelRequest as cancelRequestLifecycle, WorkflowError } from "../services/requestLifecycleService.js";
import { Op, literal } from "sequelize";
import { retryTransaction } from '../services/transactionService.js';
// Display the donor profile form (pre-filled when the user already has one)
export const donorProfilePage = async (req, res) => {
  try {
    const donor = await Donor.findOne({
      where: { userId: req.session.userId },
      order: [["createdAt", "DESC"]]
    });

    const formValues = req.session.donorFormValues;
    delete req.session.donorFormValues;
    let data = donor ? donor.toJSON() : null;
    if (data) {
      for (const field of ['dateOfBirth','lastDonationDate']) {
        if (!data[field]) continue;
        const date = new Date(data[field]);
        data[field] = Number.isFinite(date.getTime()) ? date.toISOString().slice(0,10) : '';
      }
    }
    if (formValues) data = { ...data, ...formValues };
    let donorJson = "null";
    if (data) {
      // Escape < so a value containing </script> cannot break out of the
      // <script> block this JSON is embedded in (stored XSS via profile fields).
      donorJson = JSON.stringify(data).replace(/</g, '\\u003c');
    }

    res.render("donor-profile", {
      title: "Donor Profile - VitalMatch",
      donor: data,
      coordinationIntervalDays: donationIntervalDays(),
      donorJson
    });
  } catch (error) {
    console.error("Donor profile form failed:", error.name);
    res.status(503).render("donor-profile", {
      title: "Donor Profile - VitalMatch",
      donor: null,
      coordinationIntervalDays: donationIntervalDays(),
      error: 'Your profile could not be loaded. Please retry.',
      donorJson: "null"
    });
  }
};

// Display the donor profile view (read-only)
export const viewDonorProfilePage = async (req, res) => {

  try {
    // Check if user is logged in
    if (!req.session.userId) {
            req.flash("error_msg", "Please log in to view your donor profile");
      return res.redirect("/login");
    }


    const donor = await Donor.findOne({
      where: { userId: req.session.userId },
      order: [['createdAt', 'DESC']]
    });


    res.render("view-donor-profile", {
      title: "My Donor Profile - VitalMatch",
      donor
    });
  } catch (error) {
    console.error("Donor profile failed:", error.name);
    res.status(503).render("view-donor-profile", {
      title: "My Donor Profile - VitalMatch",
      donor: null,
      error: 'Your profile could not be loaded. Please retry.'
    });
  }
};

// Handle donor profile submission
export const updateDonorProfile = async (req, res) => {
  try {
    await retryTransaction(async transaction => {
      const account = await User.findByPk(req.session.userId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!account?.isActive) throw new WorkflowError('Your account is inactive', 403);
      const required = ['fullName','dateOfBirth','gender','bloodType','weight','height','mobileNumber','address','city','province','zipCode','emergencyContactName','emergencyContactNumber','emergencyContactRelationship'];
      for (const field of required) {
        if (typeof req.body[field] !== 'string' || !req.body[field].trim()) throw new WorkflowError('Please provide ' + field);
        if (req.body[field].trim().length > 255) throw new WorkflowError(field + ' must be 255 characters or fewer');
      }
      if (!['O-','O+','A-','A+','B-','B+','AB-','AB+'].includes(req.body.bloodType)) throw new WorkflowError('Select a valid blood type');
      for (const field of ['mobileNumber','emergencyContactNumber']) if (!/^(?:\+63|0)9\d{9}$/.test(req.body[field].replace(/[\s-]/g,''))) throw new WorkflowError('Provide valid mobile contact numbers');
      const weight = Number(req.body.weight), height = Number(req.body.height);
      if (!Number.isInteger(weight) || weight < 50 || weight > 200 || !Number.isInteger(height) || height < 100 || height > 250) throw new WorkflowError('Enter valid profile weight and height');
      const dateOfBirth = parseBirthDate(req.body.dateOfBirth);
      if (!dateOfBirth) throw new WorkflowError('Provide a valid birth date in YYYY-MM-DD format');
      if (!isDonorAgeEligible(dateOfBirth)) throw new WorkflowError('The coordination profile requires an age from 18 to 65 based on your birth date');
      const lastDonationDate = req.body.lastDonationDate ? parseBirthDate(req.body.lastDonationDate) : null;
      if (req.body.lastDonationDate && (!lastDonationDate || lastDonationDate > new Date())) throw new WorkflowError('Provide a valid previous donation date');
      const latitude = req.body.latitude ? Number(req.body.latitude) : null, longitude = req.body.longitude ? Number(req.body.longitude) : null;
      if ((latitude === null) !== (longitude === null) || latitude !== null && (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180)) throw new WorkflowError('Location coordinates are invalid');
      const donor = await Donor.findOne({ where: { userId: account.id }, transaction, lock: transaction.LOCK.UPDATE });
      const recordedDate = donor ? await Fulfillment.max('fulfilledAt', { where: { donorId: donor.id }, transaction }) : null;
      const effectiveDate = recordedDate && (!lastDonationDate || new Date(recordedDate) > lastDonationDate) ? new Date(recordedDate) : lastDonationDate;
      const data = Object.fromEntries(required.filter(key => !['weight','height','dateOfBirth'].includes(key)).map(key => [key, req.body[key].trim()]));
      Object.assign(data, { dateOfBirth, weight, height, email: account.email, latitude, longitude, lastDonationDate: effectiveDate, medicalConditions: typeof req.body.medicalConditions === 'string' ? req.body.medicalConditions.trim().slice(0, 2000) : null, isAvailable: req.body.isAvailable === 'on' });
      if (data.isAvailable && !isDonorReady(data)) data.isAvailable = false;
      const saved = donor ? await donor.update(data, { transaction }) : await Donor.create({ ...data, userId: account.id }, { transaction });
      await AuditService.logAction(account.id, donor ? 'donor_profile_updated' : 'donor_profile_created', 'Donor', saved.id, null, { isAvailable: saved.isAvailable, bloodType: saved.bloodType }, { ...AuditService.getRequestContext(req), transaction });
    });
    delete req.session.donorFormValues;
    req.flash('success_msg', 'Donor profile saved. Availability is subject to the coordination interval and staff screening.');
    res.redirect('/view-donor-profile');
  } catch (error) {
    const fields = ['fullName','dateOfBirth','gender','bloodType','weight','height','mobileNumber','address','city','province','zipCode','emergencyContactName','emergencyContactNumber','emergencyContactRelationship','latitude','longitude','lastDonationDate','medicalConditions'];
    req.session.donorFormValues = Object.fromEntries(fields.filter(field => typeof req.body[field] === 'string').map(field => [field, req.body[field].slice(0,2000)]));
    req.session.donorFormValues.isAvailable = req.body.isAvailable === 'on';
    req.flash('error_msg', error.status ? error.message : 'The profile could not be saved. Please retry.');
    res.redirect('/donor-profile');
  }
};
export const myRequestsPage = async (req, res) => {
  try {
    const filter = String(req.query.filter || '');
    const where = { userId: req.session.userId, archivedAt: null };
    if (['active','pending','scheduled','fulfilled','cancelled'].includes(filter)) where.status = filter;
    const search = searchTerm(req.query);
    const searchedWhere = withTextSearch(where,search,['patientName','hospitalName','bloodType','city']);
    const sort = ['newest','oldest','urgency','status'].includes(req.query.sort) ? req.query.sort : 'newest';
    const order = sort === 'oldest' ? [['createdAt','ASC']] : sort === 'status' ? [['status','ASC'],['createdAt','DESC']] : sort === 'urgency' ? [[literal("CASE urgency WHEN 'critical' THEN 4 WHEN 'urgent' THEN 3 WHEN 'high' THEN 2 ELSE 1 END"),'DESC'],['createdAt','DESC']] : [['createdAt','DESC']];
    const { rows, pagination } = await recordPage(BloodRequest,{where:searchedWhere,order},req.query,req.path);
    res.render('my-requests', { title: 'My Requests - VitalMatch', requests: rows.map(r => ({ ...r.toJSON(), unitsRemaining: unitsRemaining(r) })), filter, search, sort, error: null, pagination });
  } catch (error) { res.status(503).render('my-requests', { title: 'Requests unavailable', requests: [], filter: null, error: 'Your requests could not be loaded. Please retry.' }); }
};
export const cancelRequest = async (req, res) => {
  try { await cancelRequestLifecycle(req.params.id, req.session.userId, req.body.reason); req.flash('success_msg', 'Request cancelled. Affected donors and coordinators have been notified.'); }
  catch (error) { req.flash('error_msg', error.status ? error.message : 'Could not cancel the request. Please retry.'); }
  res.redirect(req.session.userRole === 'hospital' ? '/hospital/patients' : '/my-requests');
};
