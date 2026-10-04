
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

import bcrypt from "bcrypt";
import { User } from "../models/userModel.js";
import { BloodRequest } from "../models/bloodRequestModel.js";
import { Donor } from "../models/donorModel.js";
import { PasswordReset } from "../models/passwordResetModel.js";
import { Fulfillment } from '../models/workflowEventModel.js';
import { nextCoordinationDate, isDonorReady } from '../services/coordinationPolicy.js';
import { canonicalRole, isHospitalAccount } from '../services/accountPolicy.js';
import { emailService } from "../services/emailService.js";
import { validatePassword, validateEmail, getBcryptRounds, hashToken, passwordPolicyMessage } from "../middleware/validation.js";
import { Op } from "sequelize";
import { AuditService } from '../services/auditService.js';
import { retryTransaction } from '../services/transactionService.js';
const publicAuditContext = (req, transaction, source, authorization = 'unauthenticated') => ({ transaction, actorRole: 'unverified', source, ipAddress: req.ip || req.socket?.remoteAddress, userAgent: req.get?.('User-Agent'), metadata: { actorAuthenticated: false, authorization } });
const refreshVerification = (id, token, req, source) => retryTransaction(async transaction => {
  const current = await User.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!current || current.emailVerified) return null;
  await current.update({ emailVerificationToken: hashToken(token), emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) }, { transaction });
  await AuditService.logAction(current.id, 'EMAIL_VERIFICATION_REQUEST', 'Users', current.id, null, null, publicAuditContext(req, transaction, source));
  return current;
});
const invalidCredentialHash = bcrypt.hash('Invalid credential timing comparison', getBcryptRounds());
export const loginPage = (req, res) => res.render("login", { title: "Login" });
export const registerPage = (req, res) => res.render("register", { title: "Register" });
export const forgotPasswordPage = (req, res) => res.render("forgotpassword", { title: "Forgot Password" });
const buildDashboardData = async (userId) => {
  const recentRequests = await BloodRequest.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit: 5
  });

  const donorUpdates = await Donor.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit: 3
  });

  const activities = [];

  recentRequests.forEach(request => {
    activities.push({
      type: 'request',
      icon: 'request',
      title: `Blood Request #${request.id}`,
      description: `Requested ${request.unitsRequired} units of ${request.bloodType} blood`,
      status: request.status,
      date: request.createdAt,
      link: `/view-blood-request/${request.id}`
    });
  });

  donorUpdates.forEach(donor => {
    activities.push({
      type: 'donor',
      icon: 'profile',
      title: 'Donor Profile Updated',
      description: `Updated profile - Blood Type: ${donor.bloodType}, Status: ${donor.isAvailable ? 'Available' : 'Unavailable'}`,
      status: donor.isAvailable ? 'active' : 'inactive',
      date: donor.createdAt,
      link: '/view-donor-profile'
    });
  });

  activities.sort((a, b) => new Date(b.date) - new Date(a.date));
  const recentActivities = activities.slice(0, 5);

  const userProfile = await User.findByPk(userId, { attributes: ['id', 'firstName', 'lastName', 'role', 'email', 'hospitalName', 'facilityId'] });
  const donorProfile = await Donor.findOne({ where: { userId } });
  const ownRequests = await BloodRequest.findAll({ where: { userId }, attributes: ['id', 'status', 'hospitalStatus'] });
  const requesterStats = {
    totalRequests: ownRequests.length,
    pendingRequests: ownRequests.filter(request => request.status === 'pending').length,
    activeRequests: ownRequests.filter(request => ['active', 'scheduled'].includes(request.status)).length
  };
  let pendingReviewCount = 0;

  let hospitalStats = null;
  if (isHospitalAccount(userProfile)) {
    // Facility membership comes from the administrator-managed stable ID.
    const allRequests = await BloodRequest.findAll({
      where: userProfile.facilityId ? { facilityId: userProfile.facilityId } : { userId },
      attributes: ['id', 'status', 'hospitalStatus', 'unitsRequired', 'unitsFulfilled']
    });
    const totalCount = allRequests.length;
    const activeCount = allRequests.filter(r => r.status === 'active').length;
    const fulfilledCount = allRequests.filter(r => r.status === 'fulfilled').length;
    const totalUnits = allRequests.reduce((sum, r) => sum + (r.unitsRequired || 0), 0);
    pendingReviewCount = userProfile.facilityId ? allRequests.filter(r => r.status === 'pending' && r.hospitalStatus === 'pending').length : 0;

    hospitalStats = {
      totalRequests: totalCount,
      activeRequests: activeCount,
      fulfilledRequests: fulfilledCount,
      totalUnitsRequested: totalUnits,
      unitsCollected: allRequests.reduce((sum, request) => sum + Number(request.unitsFulfilled || 0), 0)
    };
  }

  // Real urgent requests for the emergency alerts modal (live escalations first)
  const urgentRequests = await BloodRequest.findAll({
    where: { status: "active", hospitalStatus: "approved", urgency: { [Op.in]: ["critical", "urgent"] } },
    attributes: ["id", "bloodType", "unitsRequired", "hospitalName", "city", "urgency", "isEmergency", "emergencyExpiresAt", "createdAt"],
    order: [["isEmergency", "DESC"], ["createdAt", "DESC"]],
    limit: 3
  });

  const timeAgo = (date) => {
    const mins = Math.floor((Date.now() - new Date(date)) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  };

  const alerts = urgentRequests.map(r => {
    const data = r.toJSON();
    const emergencyActive = !!(
      data.isEmergency && data.emergencyExpiresAt &&
      new Date(data.emergencyExpiresAt) > new Date()
    );
    return {
      ...data,
      urgencyLabel: emergencyActive ? "EMERGENCY" : (data.urgency || "urgent").toUpperCase(),
      timeAgo: timeAgo(data.createdAt),
      emergencyActive
    };
  });

  // Real donation impact stats for this user (donations given, or own requests fulfilled)
  const donorFulfillments = donorProfile ? await Fulfillment.findAll({ where: { donorId: donorProfile.id }, attributes: ['unitsProvided', 'fulfilledAt'], raw: true }) : [];
  const totalDonations = donorFulfillments.length;
  const unitsDonated = donorFulfillments.reduce((sum, row) => sum + Number(row.unitsProvided || 0), 0);

  // Donor status + next eligibility (56-day whole-blood interval)
  let donorStatus = "Not Registered";
  let nextEligible = "Ready";
  if (donorProfile) {
    donorStatus = isDonorReady(donorProfile) ? "Available" : donorProfile.isAvailable ? "Awaiting eligibility" : "Paused";
    if (donorProfile.lastDonationDate) {
      const eligibleDate = nextCoordinationDate(donorProfile);
      if (eligibleDate && eligibleDate > new Date()) {
        nextEligible = eligibleDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      }
    }
  }

  // Monthly activity (last 6 months) for the mini chart
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5, 1);
  sixMonthsAgo.setHours(0, 0, 0, 0);
  const recentFulfilled = donorFulfillments.filter(row => new Date(row.fulfilledAt) >= sixMonthsAgo);
  const monthBuckets = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    monthBuckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "short" }),
      count: 0
    });
  }
  recentFulfilled.forEach(r => {
    const d = new Date(r.fulfilledAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthBuckets.find(b => b.key === key);
    if (bucket) bucket.count++;
  });
  const maxCount = Math.max(1, ...monthBuckets.map(b => b.count));
  const donationChart = monthBuckets.map(b => ({
    label: b.label,
    height: b.count > 0 ? Math.max(12, Math.round((b.count / maxCount) * 100)) : 6
  }));

  // Monthly request volume (last 6 months) for the hospital mini chart
  let hospitalChart = [];
  let ownBuckets = [];
  if (isHospitalAccount(userProfile)) {
    const ownRecent = await BloodRequest.findAll({
      where: { userId, createdAt: { [Op.gte]: sixMonthsAgo } },
      attributes: ["createdAt"],
      raw: true
    });
    ownBuckets = monthBuckets.map(b => ({ ...b, count: 0 }));
    ownRecent.forEach(r => {
      const d = new Date(r.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bucket = ownBuckets.find(b => b.key === key);
      if (bucket) bucket.count++;
    });
    const ownMax = Math.max(1, ...ownBuckets.map(b => b.count));
    hospitalChart = ownBuckets.map(b => ({
      label: b.label,
      height: b.count > 0 ? Math.max(12, Math.round((b.count / ownMax) * 100)) : 6
    }));
  }

  return {
    activities: recentActivities,
    donorProfile: donorProfile ? donorProfile.toJSON() : null,
    user: userProfile ? { ...userProfile.toJSON(), role: canonicalRole(userProfile.role) } : null,
    hospitalStats,
    requesterStats,
    pendingReviewCount,
    urgentRequests: alerts,
    donationStats: {
      totalDonations,
      unitsDonated,
      donationBar: Math.min(100, totalDonations * 10),
      unitsBar: Math.min(100, unitsDonated * 5)
    },
    donorStatus,
    nextEligible,
    donationChart,
    hospitalChart,
    hasDonationActivity: monthBuckets.some(b => b.count > 0),
    hasHospitalActivity: ownBuckets.some(b => b.count > 0)
  };
};

export const dashboardPage = async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  try {
    const dashboardData = await buildDashboardData(req.session.userId);
    res.render("dashboard", {
      title: "Dashboard",
      ...dashboardData
    });
  } catch (error) {
    console.error("Error fetching dashboard data:");
    res.status(503).render('error', { title: 'Dashboard unavailable', statusCode: 503, message: 'Your dashboard could not be loaded. Please retry; its totals and activity are currently unavailable.' });
  }
};

export const hospitalDashboardPage = async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  try {
    const dashboardData = await buildDashboardData(req.session.userId);
    if (!isHospitalAccount(dashboardData.user)) {
      return res.redirect("/dashboard");
    }

    res.render("dashboard", {
      title: "Hospital Dashboard",
      ...dashboardData
    });
  } catch (error) {
    console.error("Error fetching hospital dashboard data:");
    res.status(503).render('error', { title: 'Hospital dashboard unavailable', statusCode: 503, message: 'The facility dashboard could not be loaded. Please retry; its totals and activity are currently unavailable.' });
  }
};

// Real dashboard search: user's own requests + app pages
export const searchDashboard = async (req, res) => {
  try {
    const q = (req.query.q || "").trim().toLowerCase();
    if (q.length < 2) return res.json({ success: true, results: [] });

    const myRequests = await BloodRequest.findAll({
      where: { userId: req.session.userId },
      order: [["createdAt", "DESC"]],
      limit: 20
    });

    const results = myRequests
      .filter(r =>
        String(r.id).includes(q) ||
        (r.patientName || "").toLowerCase().includes(q) ||
        (r.hospitalName || "").toLowerCase().includes(q) ||
        (r.bloodType || "").toLowerCase().includes(q) ||
        (r.city || "").toLowerCase().includes(q)
      )
      .slice(0, 4)
      .map(r => ({
        type: "request",
        title: `Blood Request #${r.id} (${r.bloodType})`,
        subtitle: `${r.patientName} at ${r.hospitalName}`,
        url: `/view-blood-request/${r.id}`,
        status: r.status
      }));

    const pages = [
      { type: "page", title: "Request Blood", subtitle: "Submit a new blood request", url: "/new-blood-request" },
      { type: "page", title: "My Requests", subtitle: "View your blood requests", url: "/my-requests" },
      { type: "page", title: "My Profile", subtitle: "Update your donor information", url: "/view-donor-profile" },
      { type: "page", title: "Messages", subtitle: "Chat with hospitals and donors", url: "/messages" },
      { type: "page", title: "Settings", subtitle: "Manage your account settings", url: "/settings" }
    ].filter(p => p.title.toLowerCase().includes(q) || p.subtitle.toLowerCase().includes(q));

    res.json({ success: true, results: [...results, ...pages].slice(0, 6) });
  } catch (error) {
    console.error("Dashboard search error:");
    res.status(500).json({ success: false, results: [] });
  }
};

export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  // Generic response for unknown email OR wrong password so attackers cannot
  // enumerate registered addresses. Verification/active status is only revealed
  // after a correct password.
  const user = await User.findOne({ where: { email } });
  const match = await bcrypt.compare(password, user?.password || await invalidCredentialHash);
  if (!user || !match) {
    return res.status(401).render("login", { error: "Invalid email or password." });
  }

  // Check if email is verified
  if (!user.emailVerified) {
    return res.status(403).render("login", { error: "Please verify your email address before logging in. Check your inbox for the verification email." });
  }

  // Check if account is active (hospitals need admin verification, anyone can be suspended)
  if (user.isActive === false) {
    if (user.role?.toLowerCase() === "hospital") {
      return res.status(403).render("login", { error: "Your hospital account is pending verification by an administrator. Please try again later." });
    }
    return res.status(403).render("login", { error: "Your account has been deactivated. Please contact support." });
  }

  // Replace the old session so a previous account cannot leak into this login.
  req.session.regenerate((regenerateError) => {
    if (regenerateError) {
      return res.status(503).render("login", { error: "Login failed due to a server error. Please try again." });
    }

    req.session.userId = user.id;
    req.session.userRole = canonicalRole(user.role);
    req.session.authVersion = Number(user.authVersion);
    req.session.authenticatedAt = Date.now();
    req.session.lastActivityAt = Date.now();


    // Force session save before redirect
    req.session.save((saveError) => {
      if (saveError) {
        return res.status(503).render("login", { error: "Login failed due to a server error. Please try again." });
      }


      // Redirect based on role
      if (user.role?.toLowerCase() === "admin") {
        res.redirect("/admin/dashboard");
      } else if (isHospitalAccount(user)) {
        res.redirect("/hospital/dashboard");
      } else {
        res.redirect("/dashboard");
      }
    });
  });
};

export const registerUser = async (req, res) => {
  const { firstName, lastName, email, password, confirmPassword, phone, address, dateOfBirth, gender, role } = req.body;

  // Validate password match
  if (password !== confirmPassword) {
    return res.render("register", { error: "Passwords do not match." });
  }

  // Never reveal whether the address is registered: show the same success page
  // either way, refreshing the verification email when the account is unverified.
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    if (!existingUser.emailVerified) {
      try {
        const retryToken = emailService.generateVerificationToken();
        const current = await refreshVerification(existingUser.id, retryToken, req, 'duplicate-registration-verification-request');
        if (current) await emailService.sendVerificationEmail(current.email, current.firstName, retryToken);
      } catch (e) {
        console.error("Resend on duplicate registration:");
      }
    }
    return res.render("register-success", {
      title: "Registration Successful",
      email: email,
      firstName
    });
  }

  try {
    // Generate verification token
    const verificationToken = emailService.generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Hash password and create user.
    // Public registration is always donor: hospital accounts are issued by an
    // administrator. The submitted role is ignored (defense in depth alongside
    // validation, in case the middleware is ever bypassed).
    const hashed = await bcrypt.hash(password, getBcryptRounds());
    const userRole = "donor";
    const user = await retryTransaction(async transaction => {
      const created = await User.create({
      firstName,
      lastName,
      email,
      password: hashed,
      phone,
      address,
      dateOfBirth,
      gender,
      role: userRole,
      isActive: true, // donor-only registration; hospitals are activated by admins
      emailVerified: false,
      emailVerificationToken: hashToken(verificationToken),
      emailVerificationExpires: verificationExpires
      }, { transaction });
      await AuditService.logAction(created.id, 'ACCOUNT_REGISTER', 'Users', created.id, null, { role: userRole, isActive: true, emailVerified: false }, publicAuditContext(req, transaction, 'public-registration'));
      return created;
    });

    // Send verification email
    const result = await emailService.sendVerificationEmail(email, firstName, verificationToken);

    if (result.success) {
      res.render("register-success", {
        title: "Registration Successful",
        email: email,
        firstName: firstName,
        previewUrl: result.previewUrl
      });
    } else {
      // If email fails, still create account but show warning
      res.send("Account created successfully, but we couldn't send the verification email. Please contact support.");
    }

  } catch (error) {
    console.error("Registration error:");
    res.render("register", { error: "Registration failed due to a server error. Please try again." });
  }
};

export const logoutUser = (req, res) => {
  req.app.get('io')?.in(`session:${req.sessionID}`).disconnectSockets(true);
  req.session.destroy((error) => {
    if (error) {
      console.error("Logout session error:");
    }

    res.clearCookie('vitalmatch.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    res.set('Clear-Site-Data', '"cache"');
    res.redirect("/login");
  });
};

// Email verification handler
export const verifyEmail = async (req, res) => {
  const { token } = req.query;

  if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{32,256}$/.test(token)) {
    return res.send("Invalid verification link");
  }

  try {
    // Consume and audit in the same transaction. Legacy plaintext links remain
    // valid, while concurrent verification attempts cannot consume a token twice.
    const user = await retryTransaction(async transaction => {
      const current = await User.findOne({ where: {
        emailVerificationToken: { [Op.in]: [hashToken(token), token] },
        emailVerificationExpires: { [Op.gt]: new Date() }, emailVerified: false
      }, transaction, lock: transaction.LOCK.UPDATE });
      if (!current) return null;
      await current.update({ emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null }, { transaction });
      await AuditService.logAction(current.id, 'EMAIL_VERIFY', 'Users', current.id, { emailVerified: false }, { emailVerified: true }, publicAuditContext(req, transaction, 'email-verification', 'single-use-email-verification-link'));
      return current;
    });

    if (!user) {
      return res.render("verification-failed", {
        title: "Verification Failed",
        message: "Invalid or expired verification link"
      });
    }

    // Send welcome email
    await emailService.sendWelcomeEmail(user.email, user.firstName);

    res.render("verification-success", {
      title: "Email Verified",
      firstName: user.firstName
    });

  } catch (error) {
    console.error("Email verification error:");
    res.send("Verification failed. Please try again.");
  }
};

// Resend verification email
export const resendVerification = async (req, res) => {
  const { email } = req.body;
  if (!validateEmail(email)) return res.status(400).json({ success: false, message: 'Please provide a valid email address' });

  try {
    const user = await User.findOne({ where: { email } });

    // Uniform response so attackers cannot probe which emails are registered
    // or verified. The email is only sent when it is actually needed.
    const uniformMessage = "If an account with that email exists and is unverified, a new verification link was sent.";
    if (!user || user.emailVerified) {
      return res.json({ success: true, message: uniformMessage });
    }

    // Generate new token
    const verificationToken = emailService.generateVerificationToken();
    const current = await refreshVerification(user.id, verificationToken, req, 'verification-resend');
    // Send verification email
    const result = current ? await emailService.sendVerificationEmail(current.email, current.firstName, verificationToken) : { success: true };
    if (!result.success) {
      console.error("Resend verification delivery was not accepted.");
    }

    res.json({ success: true, message: uniformMessage });

  } catch (error) {
    console.error("Resend verification error:");
    res.json({ success: true, message: "If an account with that email exists and is unverified, a new verification link was requested." });
  }
};

// Request a password reset link (always shows success to prevent email enumeration)
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    if (!validateEmail(email)) {
      req.flash("error_msg", "Please enter your email address");
      return res.redirect("/forgot-password");
    }

    const user = await User.findOne({ where: { email, isActive: true, archivedAt: null } });

    if (user) {
      const token = emailService.generateVerificationToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      const eligible = await retryTransaction(async transaction => {
        const current = await User.findByPk(user.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!current || current.email !== email || !current.isActive || current.archivedAt) return null;
        await PasswordReset.update({ used: true }, { where: { email, used: false }, transaction });
        await PasswordReset.create({ email, token: hashToken(token), expiresAt }, { transaction });
        await AuditService.logAction(current.id, 'PASSWORD_RESET_REQUEST', 'Users', current.id, null, null, publicAuditContext(req, transaction, 'password-reset-request'));
        return current;
      });

      if (eligible) {
        const result = await emailService.sendPasswordResetEmail(eligible.email, eligible.firstName, token);
        if (!result.success) console.error('Password reset delivery was not accepted.');
      }
    }

    res.render("forgotpassword", {
      title: "Forgot Password",
      resetSent: true
    });
  } catch (error) {
    console.error("Request password reset error:");
    req.flash("error_msg", "Something went wrong. Please try again.");
    res.redirect("/forgot-password");
  }
};

// Display the reset password form for a valid token
export const resetPasswordPage = async (req, res) => {
  try {
    const { token } = req.params;
    if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{32,256}$/.test(token)) return res.status(400).render('reset-password', { title: 'Reset Password', tokenValid: false });
    // Hashed lookup; legacy plaintext rows are upgraded on match.
    let record = await PasswordReset.findOne({ where: { token: hashToken(token), used: false } });
    if (!record) {
      record = await PasswordReset.findOne({ where: { token, used: false } });
      if (record) await record.update({ token: hashToken(token) });
    }

    const resetAccount = record && await User.findOne({ where: { email: record.email, isActive: true, archivedAt: null } });
    if (!record || record.expiresAt < new Date() || !resetAccount) {
      return res.render("reset-password", {
        title: "Reset Password",
        tokenValid: false,
        token
      });
    }

    res.render("reset-password", {
      title: "Reset Password",
      tokenValid: true,
      token
    });
  } catch (error) {
    console.error("Reset password page error:");
    res.render("reset-password", { title: "Reset Password", tokenValid: false, token: null });
  }
};

// Handle the new password submission
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword, confirmPassword } = req.body;
    if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{32,256}$/.test(token)) return res.status(400).render('reset-password', { title: 'Reset Password', tokenValid: false });

    // Hashed lookup; legacy plaintext rows are upgraded on match.
    let record = await PasswordReset.findOne({ where: { token: hashToken(token), used: false } });
    if (!record) {
      record = await PasswordReset.findOne({ where: { token, used: false } });
      if (record) await record.update({ token: hashToken(token) });
    }
    if (!record || record.expiresAt < new Date()) {
      req.flash("error_msg", "This reset link is invalid or has expired");
      return res.redirect("/forgot-password");
    }

    if (!newPassword || !confirmPassword) {
      req.flash("error_msg", "Please fill in all password fields");
      return res.redirect(`/reset-password/${token}`);
    }

    if (newPassword !== confirmPassword) {
      req.flash("error_msg", "Passwords do not match");
      return res.redirect(`/reset-password/${token}`);
    }

    if (!validatePassword(newPassword)) {
      req.flash("error_msg", passwordPolicyMessage());
      return res.redirect(`/reset-password/${token}`);
    }

    const user = await User.findOne({ where: { email: record.email, isActive: true, archivedAt: null } });
    if (!user) {
      req.flash("error_msg", "This reset link is invalid or has expired");
      return res.redirect("/forgot-password");
    }

    const hashed = await bcrypt.hash(newPassword, getBcryptRounds());
    await retryTransaction(async transaction => {
      const lockedUser = await User.findByPk(user.id, { transaction, lock: transaction.LOCK.UPDATE });
      const current = await PasswordReset.findByPk(record.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!lockedUser || !lockedUser.isActive || lockedUser.archivedAt || !current || current.used || current.expiresAt < new Date() || lockedUser.email !== current.email || current.email !== record.email || ![hashToken(token), token].includes(current.token)) throw new Error('Reset token expired, used, or account identity changed');
      await lockedUser.update({ password: hashed }, { transaction });
      await lockedUser.increment('authVersion', { transaction });
      await PasswordReset.update({ used: true }, { where: { email: record.email, used: false }, transaction });
      await AuditService.logAction(user.id, 'PASSWORD_RESET', 'Users', user.id, null, { sessionsRevoked: true }, publicAuditContext(req, transaction, 'password-reset', 'single-use-password-reset-link'));
    });
    req.app.get('io')?.in(`user:${user.id}`).disconnectSockets(true);
    req.session.destroy(() => {
      res.clearCookie('vitalmatch.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
      res.set('Clear-Site-Data', '"cache"');
      res.redirect('/login?passwordReset=complete');
    });
  } catch (error) {
    console.error("Reset password error:");
    req.flash("error_msg", "Something went wrong. Please try again.");
    res.redirect("/forgot-password");
  }
};
